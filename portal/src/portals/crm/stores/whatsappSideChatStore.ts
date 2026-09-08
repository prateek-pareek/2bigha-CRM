import { create } from "zustand";

export interface WhatsAppSideChatTarget {
  waId?: string;
  phone?: string;
  leadId?: string;
  leadName?: string;
  contactName?: string;
}

interface WhatsAppSideChatState {
  isOpen: boolean;
  isMinimized: boolean;
  target: WhatsAppSideChatTarget | null;
  openChat: (target: WhatsAppSideChatTarget) => void;
  closeChat: () => void;
  toggleMinimize: () => void;
}

export const useWhatsAppSideChatStore = create<WhatsAppSideChatState>((set) => ({
  isOpen: false,
  isMinimized: false,
  target: null,
  openChat: (target) => {
    // Extract waId if only phone is provided
    let waId = target.waId;
    if (!waId && target.phone) {
      waId = target.phone.replace(/\D/g, "");
    }
    set({
      isOpen: true,
      isMinimized: false,
      target: { ...target, waId },
    });
  },
  closeChat: () => set({ isOpen: false, isMinimized: false, target: null }),
  toggleMinimize: () => set((state) => ({ isMinimized: !state.isMinimized })),
}));
