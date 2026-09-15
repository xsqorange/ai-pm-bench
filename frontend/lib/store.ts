"use client";
import { create } from "zustand";

type UIState = {
  currentProjectId: number | null;
  currentConversationId: number | null;
  currentAgentId: number | null;
  setProjectId: (id: number | null) => void;
  setConversationId: (id: number | null) => void;
  setAgentId: (id: number | null) => void;
};

export const useUIStore = create<UIState>((set) => ({
  currentProjectId: null,
  currentConversationId: null,
  currentAgentId: null,
  setProjectId: (id) => set({ currentProjectId: id }),
  setConversationId: (id) => set({ currentConversationId: id }),
  setAgentId: (id) => set({ currentAgentId: id }),
}));