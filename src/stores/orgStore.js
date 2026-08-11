import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'

/**
 * The signed-in user's organisation and role.
 *
 * This is display state only — it decides what the UI shows, never what the
 * user is allowed to do. Access is enforced by RLS in the database, so faking
 * a role here changes nothing except what this browser draws.
 */
export const useOrgStore = create((set) => ({
  org: null,
  role: null,
  loading: true,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('memberships')
        .select('role, organisations(*)')
        .maybeSingle()
      if (error) throw error

      // No membership yet? They may have been invited — joining is by email,
      // so an invited colleague never needs to click a link.
      if (!data) {
        const { data: claimedOrgId } = await supabase.rpc('claim_invitation')
        if (claimedOrgId) {
          const { data: joined } = await supabase
            .from('memberships').select('role, organisations(*)').maybeSingle()
          set({
            org: joined?.organisations ?? null,
            role: joined?.role ?? null,
            loading: false,
          })
          return
        }
      }

      set({
        org: data?.organisations ?? null,
        role: data?.role ?? null,
        loading: false,
      })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  createOrg: async (name) => {
    const { data, error } = await supabase.rpc('create_organisation', { p_name: name })
    if (error) throw error
    set({ org: data, role: 'owner' })
    return data
  },

  clear: () => set({ org: null, role: null, loading: true, error: null }),
}))

/** Cost prices and margins are hidden from the sales role. */
export const canSeeCost = (role) => role === 'owner' || role === 'manager'
