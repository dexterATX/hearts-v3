// ui/Text.tsx — themed text primitive.
//
// Weight is a PROP, not a style. Custom fonts need an explicit family per
// weight on Android; passing `fontWeight` alongside a custom `fontFamily`
// gives faux-bold on one platform and the wrong face on the other.
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, type, fonts } from '../theme/theme';

type Variant = keyof typeof type;
type Weight = keyof typeof fonts;

export function Text({
  variant = 'body',
  weight,
  color = colors.ink,
  style,
  ...rest
}: RNTextProps & { variant?: Variant; weight?: Weight; color?: string }) {
  const base: TextStyle = { ...type[variant], color };
  if (weight) base.fontFamily = fonts[weight];
  return <RNText style={[base, style]} {...rest} />;
}
