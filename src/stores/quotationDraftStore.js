import { create } from 'zustand'

export const useQuotationDraft = create((set) => ({
  step: 1,
  rows: [],
  company: null,
  date: new Date().toISOString().slice(0, 10),
  status: 'pending',
  notes: '',
  quotationId: null,

  setStep: (step) => set({ step }),
  setRows: (rows) => set({ rows }),
  setCompany: (company) => set({ company }),
  setDate: (date) => set({ date }),
  setStatus: (status) => set({ status }),
  setNotes: (notes) => set({ notes }),
  setQuotationId: (quotationId) => set({ quotationId }),

  // Update multiple fields at once
  updateDraft: (updates) => set((state) => ({ ...state, ...updates })),

  // Clear entire draft
  clearDraft: () => set({
    step: 1,
    rows: [],
    company: null,
    date: new Date().toISOString().slice(0, 10),
    status: 'pending',
    notes: '',
    quotationId: null,
  }),
}))
