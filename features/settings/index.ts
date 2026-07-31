// features/settings/index.ts — public surface only.
export { usePrefs, useTogglePref, useSaveProfile, useAppLock, useExport } from './hooks';
export { PREF_KEYS, prefEnabled, validAnniversary, exportFileName } from './model';
export { SettingsScreen } from './ui/SettingsScreen';
export { LockScreen } from './ui/LockScreen';
