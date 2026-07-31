// app/games/cards.tsx — thin route: session id in, slice screen out.
import { useLocalSearchParams } from 'expo-router';
import { CardsScreen } from '../../../features/games';
import { usePublishPresence } from '../../../features/presence';

export default function CardsRoute() {
  usePublishPresence('cards');
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <CardsScreen sessionId={sessionId ?? ''} />;
}
