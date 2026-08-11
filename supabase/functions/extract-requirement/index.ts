// Extracts line items from photographed/screenshotted requirement sheets.
//
// This exists so the OpenAI key stays on the server. Previously the key was
// inlined into the browser bundle (VITE_OPENAI_API_KEY), which let anyone who
// loaded the app spend the account balance. The browser now sends images with
// its Supabase session JWT; this function checks the caller is signed in,
// enforces limits, and calls OpenAI with a key the client never sees.
//
// Deploy:  npx supabase functions deploy extract-requirement
// Secret:  npx supabase secrets set OPENAI_API_KEY=sk-...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_IMAGES = 10
const MAX_TOTAL_BYTES = 20 * 1024 * 1024 // 20 MB of base64 across all images
const MODEL = 'gpt-4o-mini'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  // --- who is calling? -------------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Sign in to use requirement extraction.' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return json({ error: 'Your session has expired. Sign in again.' }, 401)
  }

  // --- validate input --------------------------------------------------------
  let payload: { images?: string[] }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Malformed request body.' }, 400)
  }

  const images = Array.isArray(payload.images) ? payload.images : []
  if (images.length === 0) return json({ error: 'No images were sent.' }, 400)
  if (images.length > MAX_IMAGES) {
    return json({ error: `Send at most ${MAX_IMAGES} images at a time.` }, 400)
  }

  const totalBytes = images.reduce((sum, img) => sum + img.length, 0)
  if (totalBytes > MAX_TOTAL_BYTES) {
    return json({ error: 'Those images are too large. Try fewer, or smaller, images.' }, 413)
  }
  if (!images.every((img) => typeof img === 'string' && img.startsWith('data:image/'))) {
    return json({ error: 'Only image files can be read.' }, 400)
  }

  // --- quota -----------------------------------------------------------------
  // Checked before spending anything: one shared account paying for every
  // tenant's extraction is how a usage-based cost becomes an unbounded one.
  const { data: quota, error: quotaError } = await supabase
    .rpc('check_ai_quota', { p_pages: images.length })

  if (quotaError) {
    console.error('quota check failed', quotaError)
    return json({ error: 'Could not verify your usage allowance. Try again.' }, 500)
  }
  if (quota?.reason === 'no_organisation') {
    return json({ error: 'Set up your company before reading requirement sheets.' }, 403)
  }
  if (!quota?.allowed) {
    return json({
      error: `You have used all ${quota?.limit ?? 0} requirement pages included this month. Upgrade your plan to read more.`,
      used: quota?.used,
      limit: quota?.limit,
    }, 402)
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    console.error('OPENAI_API_KEY secret is not set on this project')
    return json({ error: 'Requirement extraction is not configured. Contact support.' }, 500)
  }

  // --- extract ---------------------------------------------------------------
  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: "OCR table. Return JSON: {'r':[['name',qty,'unit',rate]]}. Max brevity.",
          },
          {
            role: 'user',
            content: images.map((url) => ({
              type: 'image_url',
              image_url: { url, detail: 'auto' },
            })),
          },
        ],
      }),
    })
  } catch (err) {
    console.error('OpenAI request failed', err)
    return json({ error: 'Could not reach the extraction service. Try again.' }, 502)
  }

  if (!response.ok) {
    const detail = await response.text()
    // Never forward the upstream body — it can echo key or account details.
    console.error('OpenAI returned', response.status, detail.slice(0, 500))
    return json({ error: 'The images could not be read. Try clearer photos.' }, 502)
  }

  const completion = await response.json()
  const usage = completion.usage ?? {}

  // Record against the organisation's allowance. Deliberately not awaited into
  // the failure path: the money is already spent, so a logging failure must not
  // lose the user their extracted rows.
  const { error: usageError } = await supabase.rpc('record_ai_usage', {
    p_pages: images.length,
    p_prompt_tokens: usage.prompt_tokens ?? null,
    p_completion_tokens: usage.completion_tokens ?? null,
  })
  if (usageError) console.error('failed to record ai usage', usageError)

  console.log(JSON.stringify({
    event: 'ai_extraction',
    user_id: user.id,
    images: images.length,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
  }))

  let parsed: { r?: unknown[] }
  try {
    parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? '{}')
  } catch {
    return json({ error: 'The images could not be read. Try clearer photos.' }, 422)
  }

  const rawRows = Array.isArray(parsed.r) ? parsed.r : []
  if (rawRows.length === 0) {
    return json({ error: 'No table rows were found in those images.' }, 422)
  }

  const rows = rawRows
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => ({
      raw_product_name: String(row[0] ?? ''),
      quantity: Number.parseFloat(String(row[1])) || 0,
      unit: String(row[2] ?? 'pcs'),
      rate: Number.parseFloat(String(row[3])) || 0,
    }))
    .filter((row) => row.raw_product_name.trim().length > 0)

  if (rows.length === 0) {
    return json({ error: 'No table rows were found in those images.' }, 422)
  }

  return json({ rows })
})
