// ui/Card.tsx — surface container.
import { View, type ViewProps } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';

export function Card({ style, ...rest }: ViewProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.line,
          padding: spacing.lg,
        },
        style,
      ]}
      {...rest}
    />
  );
}
