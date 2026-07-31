// features/games/engine/secrets.ts — words and fleets live HERE ONLY (§2.6).
// Persisted to expo-secure-store (Keystore/Keychain-backed) so a killed app
// doesn't strand a game — and the secret never touches the network.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { FleetLayout } from '../battleship/rules';

const secureStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

type SecretsState = {
  words: Record<string, string>; // sessionId → the word I set (hangman)
  fleets: Record<string, FleetLayout>; // sessionId → my sea (battleship)
  setWord: (sessionId: string, word: string) => void;
  setFleet: (sessionId: string, layout: FleetLayout) => void;
  clearSession: (sessionId: string) => void;
};

export const useGameSecrets = create<SecretsState>()(
  persist(
    (set) => ({
      words: {},
      fleets: {},
      setWord: (sessionId, word) =>
        set((s) => ({ words: { ...s.words, [sessionId]: word.toLowerCase().trim() } })),
      setFleet: (sessionId, layout) =>
        set((s) => ({ fleets: { ...s.fleets, [sessionId]: layout } })),
      clearSession: (sessionId) =>
        set((s) => {
          const words = { ...s.words };
          const fleets = { ...s.fleets };
          delete words[sessionId];
          delete fleets[sessionId];
          return { words, fleets };
        }),
    }),
    { name: 'hearts-game-secrets', storage: createJSONStorage(() => secureStorage) },
  ),
);
