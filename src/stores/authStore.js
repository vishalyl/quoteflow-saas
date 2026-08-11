import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'

/**
 * Session-backed auth store.
 *
 * The session is owned by Supabase (a real, expiring, server-verifiable JWT
 * kept in localStorage under Supabase's own key and refreshed automatically).
 * Nothing in this store grants access on its own — it only mirrors the session
 * so React can render against it. Setting a flag in devtools does nothing,
 * because every request to the database carries the JWT and is checked there.
 */
export const useAuthStore = create((set, get) => ({
  session: null,
  user: null,
  // 'loading' until we've asked Supabase whether a session already exists.
  // Rendering the login screen before that resolves would flash logged-out
  // users of an already-valid session back to the login form on every refresh.
  initialising: true,

  /** Called once on app mount. Returns an unsubscribe function. */
  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, initialising: false })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      set({ session: nextSession, user: nextSession?.user ?? null, initialising: false })
    })

    return () => subscription.unsubscribe()
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw error
    set({ session: data.session, user: data.user })
    return data
  },

  signUp: async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName?.trim() || null } },
    })
    if (error) throw error
    set({ session: data.session, user: data.user })
    // When email confirmation is enabled in Supabase, data.session is null and
    // the user must click the link in their inbox before they can sign in.
    return { needsEmailConfirmation: !data.session }
  },

  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null })
  },

  /** Display name for the top bar. */
  displayName: () => {
    const user = get().user
    return user?.user_metadata?.full_name || user?.email || ''
  },
}))
