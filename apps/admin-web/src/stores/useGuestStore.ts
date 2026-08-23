import { create } from 'zustand'

interface GuestModeStore {
  isGuestMode: boolean
  setGuestMode: (value: boolean) => void
}

export const useGuestStore = create<GuestModeStore>((set) => ({
  isGuestMode: localStorage.getItem('guest_mode') === 'true' || false,
  setGuestMode: (value: boolean) => {
    localStorage.setItem('guest_mode', value ? 'true' : 'false')
    set({ isGuestMode: value })
  },
}))
