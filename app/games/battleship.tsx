// app/games/battleship.tsx — thin route: session id in, slice screen out.
import { useLocalSearchParams } from 'expo-router';
import { BattleshipScreen } from '../../../features/games';
import { usePublishPresence } from '../../../features/presence';

export default function BattleshipRoute() {
  usePublishPresence('battleship');
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <BattleshipScreen sessionId={sessionId ?? ''} />;
}
