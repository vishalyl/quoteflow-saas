# Supabase — deploy & migrate

The Supabase CLI is a dev dependency, so every command below is `npx supabase …`
and needs no global install.

## One-time setup

```bash
npx supabase login                    # opens a browser
npx supabase link --project-ref XXXX  # the ref is in your project URL
```

## Edge functions

`extract-requirement` reads photographed requirement sheets. It holds the OpenAI
key server-side — **the image upload feature does not work until this is
deployed and the secret is set.**

```bash
npx supabase secrets set OPENAI_API_KEY=sk-...   # use a NEWLY ROTATED key
npx supabase functions deploy extract-requirement
```

The old key was compiled into the public JS bundle. Treat it as compromised:
revoke it at platform.openai.com and set a hard monthly spend cap on the account.

## Migrations

```bash
npx supabase db push          # apply pending migrations to the linked project
npx supabase migration list   # what's applied where
```

Never edit a migration that has already been applied to production — add a new
one. Apply to a staging project first once one exists.
