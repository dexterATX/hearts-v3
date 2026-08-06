// app/(tabs)/play.tsx — thin route: presence + the slice's arcade screen.
import { PlayScreen } from '../../features/games';
import { usePublishPresence } from '../../features/presence';

export default function PlayTab() {
  usePublishPresence('play');
  return <PlayScreen />;
}
