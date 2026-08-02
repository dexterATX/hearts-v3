// ui/Icon.tsx — stroke icons on react-native-svg (already a dependency).
//
// Emoji were the single most "unfinished" thing in the old UI: they render in
// each platform's own house style and ignore the palette entirely. These are
// one consistent 24px grid, 1.6 stroke, round caps, and they take the colour
// they are given — so an active tab is genuinely blue, not a yellow blob.
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { colors } from '../theme/theme';

export type IconName =
  | 'home'
  | 'letter'
  | 'play'
  | 'heart'
  | 'settings'
  | 'mic'
  | 'image'
  | 'brush'
  | 'calendar'
  | 'book'
  | 'lock'
  | 'check'
  | 'close'
  | 'chevronRight'
  | 'alert'
  | 'sparkle';

const PATHS: Record<IconName, React.ReactNode> = {
  home: <Path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" />,
  letter: <Path d="M3 6.5h18v11H3zM3 7l9 6.5L21 7" />,
  play: <Path d="M5 5.5h14v10H5zM8.5 19h7M12 15.5V19M9 9.5v2.5M15 9.5v2.5" />,
  heart: <Path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />,
  settings: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
    </>
  ),
  mic: (
    <>
      <Rect x="9" y="2.5" width="6" height="11" rx="3" />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18.5v3" />
    </>
  ),
  image: (
    <>
      <Rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <Circle cx="8.5" cy="10" r="1.6" />
      <Path d="m4 17 4.5-4.5 4 4L16 13l4 4" />
    </>
  ),
  brush: <Path d="M14.5 3.5 20.5 9.5 9 21H3v-6zM12.5 5.5l6 6" />,
  calendar: (
    <>
      <Rect x="3" y="5" width="18" height="16" rx="2.5" />
      <Path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  book: <Path d="M4 4h6a2.5 2.5 0 0 1 2 2.2V20a2 2 0 0 0-2-1.6H4zM20 4h-6a2.5 2.5 0 0 0-2 2.2V20a2 2 0 0 1 2-1.6h6z" />,
  lock: (
    <>
      <Rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  check: <Path d="m4.5 12.5 5 5 10-11" />,
  close: <Path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />,
  chevronRight: <Path d="m9.5 4.5 7.5 7.5-7.5 7.5" />,
  alert: (
    <>
      <Path d="M12 3.5 22 20H2ZM12 10v4.5" />
      <Circle cx="12" cy="17.4" r="0.9" />
    </>
  ),
  sparkle: <Path d="M12 3v6M12 15v6M3 12h6M15 12h6M6.4 6.4 9 9M15 15l2.6 2.6M17.6 6.4 15 9M9 15l-2.6 2.6" />,
};

export function Icon({
  name,
  size = 24,
  color = colors.ink,
  strokeWidth = 1.6,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </Svg>
  );
}
