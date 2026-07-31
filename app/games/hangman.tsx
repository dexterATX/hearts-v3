// app/games/hangman.tsx — thin route: session id in, slice screen out.
import { useLocalSearchParams } from 'expo-router';
import { HangmanScreen } from '../../features/games';
import { usePublishPresence } from '../../features/presence';

export default function HangmanRoute() {
  usePublishPresence('hangman');
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <HangmanScreen sessionId={sessionId ?? ''} />;
}
