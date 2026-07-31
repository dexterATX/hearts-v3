// features/auth/index.ts — the slice's PUBLIC surface. Nothing else is
// importable from outside (spec §2.2).
export { useAuthBootstrap, useSignIn, usePairing } from './hooks';
export { generateInviteCode, isValidInviteCode } from './model';
export { SignInScreen } from './ui/SignInScreen';
export { PairScreen } from './ui/PairScreen';
