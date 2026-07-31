// app/letters/new.tsx — thin route; the slice's form owns everything.
import { router } from 'expo-router';
import { NewLetterForm } from '../../features/letters';
import { usePublishPresence } from '../../features/presence';

export default function NewLetterRoute() {
  usePublishPresence('letters', 'new-letter');
  return <NewLetterForm onSent={() => router.back()} />;
}
