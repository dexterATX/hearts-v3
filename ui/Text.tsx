// ui/Text.tsx — themed text primitive.
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, type } from '../theme/theme';

type Variant = keyof typeof type;

export function Text({
  variant = 'body',
  color = colors.ink,
  style,
  ...rest
}: RNTextProps & { variant?: Variant; color?: string }) {
  const base: TextStyle = { ...type[variant], color };
  return <RNText style={[base, style]} {...rest} />;
}
