// app/(auth)/pair.tsx — thin route; the slice owns everything.
// Once a couple exists (I created, or I just joined hers), leave the auth
// group — nothing in the flow itself navigates (round-3 finding).
import { useEffect } from 'react';
import { router } from 'expo-router';
import { PairScreen } from '../../features/auth';
import { useSession } from '../../lib/session/store';

export default function PairRoute() {
  const coupleId = useSession((s) => s.coupleId);
  const partner = useSession((s) => s.partner);
  // Leave only once pairing is genuinely COMPLETE (both of us in the couple).
  // Redirecting on coupleId alone fired the instant create_couple returned —
  // unmounting this screen before the invite code could render, so the code
  // could never be read or sent and pairing could never finish. The joiner
  // navigates itself from PairScreen; this covers the creator, who leaves
  // when she actually joins.
  useEffect(() => {
    if (coupleId && partner) router.replace('/(tabs)');
  }, [coupleId, partner]);
  return <PairScreen />;
}
