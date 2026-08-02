// ui/Input.tsx — the one text field.
//
// Eleven screens had hand-rolled TextInputs with slightly different padding,
// radius and placeholder colour. This is that, once: a metal rim with a
// travelling shine, an optional label, and an error state that is announced
// rather than only coloured.
import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius, spacing, type, motion } from '../theme/theme';
import { Text } from './Text';
import { MetallicFrame, SILVER_METAL, BLUE_METAL, DANGER_METAL } from './MetallicFrame';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  /** big, centred, letterspaced — pairing codes and PINs */
  code?: boolean;
};

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, code = false, style, onFocus, onBlur, ...rest },
  ref,
) {
  // Focus runs entirely on the UI thread as a shared value. It used to be React
  // state that also toggled `elevation` on the wrapper — and changing elevation
  // on a View containing a focused TextInput makes Android reattach the native
  // view and drop the IME, so the keyboard opened and shut again ~5ms later.
  const focus = useSharedValue(0);

  return (
    <View>
      {label ? (
        <Text
          variant="overline"
          color={colors.muted}
          style={{ marginBottom: spacing.sm, textTransform: 'uppercase' }}
        >
          {label}
        </Text>
      ) : null}
      <MetallicFrame
        cornerRadius={radius.md}
        stops={error ? DANGER_METAL : SILVER_METAL}
        litStops={error ? DANGER_METAL : BLUE_METAL}
        lit={focus}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={colors.faint}
          selectionColor={colors.blue}
          accessibilityLabel={label}
          onFocus={(e) => {
            focus.value = withTiming(1, { duration: motion.fadeMs });
            onFocus?.(e);
          }}
          onBlur={(e) => {
            focus.value = withTiming(0, { duration: motion.fadeMs });
            onBlur?.(e);
          }}
          style={[
            {
              color: colors.ink,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              ...type.body,
            },
            code
              ? { ...type.display, textAlign: 'center', letterSpacing: 10, paddingVertical: spacing.lg }
              : null,
            style,
          ]}
          {...rest}
        />
      </MetallicFrame>
      {error ? (
        <Text
          variant="caption"
          color={colors.danger}
          accessibilityLiveRegion="polite"
          style={{ marginTop: spacing.sm }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
});
