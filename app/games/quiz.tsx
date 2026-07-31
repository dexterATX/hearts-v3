// app/games/quiz.tsx — thin route: session id in, slice screen out.
import { useLocalSearchParams } from 'expo-router';
import { QuizScreen } from '../../features/games';
import { usePublishPresence } from '../../features/presence';

export default function QuizRoute() {
  usePublishPresence('quiz');
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <QuizScreen sessionId={sessionId ?? ''} />;
}
