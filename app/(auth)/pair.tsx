// app/(auth)/pair.tsx — thin route; the slice owns everything.
// Once a couple exists (I created, or I just joined hers), leave the auth
// group — nothing in the flow itself navigates (round-3 finding).
import { useEffect } from 'react';
import { router } from 'expo-router';
import { PairScreen } from '../../features/auth';
import { useSession } from '../../lib/session/store';

export default function PairRoute() {
  const coupleId = useSession((s) => s.coupleId);
  useEffect(() => {
    if (coupleId) router.replace('/(tabs)');
  }, [coupleId]);
  return <PairScreen />;
}
