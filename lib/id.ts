// lib/id.ts — uuid v4 for idempotency keys, row ids, op ids.
//
// RN Hermes has NO global crypto (device finding: "Property 'crypto' doesn't
// exist"). The app injects expo-crypto's getRandomValues at startup via
// setUuidRng; the fallback keeps this file pure so model.ts tests run in
// plain node with no native modules.
type Rng = (bytes: Uint8Array) => void;

let customRng: Rng | null = null;

/** Called once at app start (app/_layout.tsx) with expo-crypto's CSPRNG. */
export function setUuidRng(rng: Rng): void {
  customRng = rng;
}

export function newUuid(): string {
  const bytes = new Uint8Array(16);
  if (customRng) {
    customRng(bytes);
  } else {
    // fallback for node tests — idempotency keys only need uniqueness here
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}
