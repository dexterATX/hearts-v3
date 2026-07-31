// app/canvas.tsx — thin route; the slice owns the board.
import { CanvasBoard } from '../features/canvas';
import { usePublishPresence } from '../features/presence';

export default function CanvasRoute() {
  usePublishPresence('canvas');
  return <CanvasBoard />;
}
