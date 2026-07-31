// features/settings/ui/LockScreen.tsx — the opaque lock overlay (§7.17).
// Rendered above everything while locked; biometrics first, PIN fallback.
import { useEffect, useState } from 'react';
import { View, TextInput } from 'react-native';
import { Text, Button } from '../../../ui';
import { colors, spacing, radius } from '../../../theme/theme';
import { useAppLock } from '../hooks';
import { LOCKOUT_AFTER } from '../model';

export function LockScreen() {
  const lock = useAppLock();
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  // try biometrics the moment the lock shows — if the phone has them
  useEffect(() => {
    if (lock.biometricsAvailable) void lock.unlockWithBiometrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per lock
  }, [lock.locked]);

  const tryPin = async () => {
    const okPin = await lock.unlockWithPin(pin);
    setPin('');
    setWrong(!okPin);
  };

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        zIndex: 999,
      }}
    >
      <Text variant="display" style={{ marginBottom: spacing.md }}>
        ♥️
      </Text>
      <Text variant="title" style={{ marginBottom: spacing.xxl }}>
        hearts is locked
      </Text>

      {lock.lockedOut ? (
        <Text variant="body" color={colors.rose} style={{ textAlign: 'center' }}>
          too many wrong tries — use your face or fingerprint to get back in
        </Text>
      ) : lock.cooldownUntil ? (
        <CooldownMessage until={lock.cooldownUntil} />
      ) : (
        <>
          <TextInput
            placeholder="your PIN"
            placeholderTextColor={colors.muted}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            style={{
              color: colors.ink,
              fontSize: 24,
              letterSpacing: 8,
              textAlign: 'center',
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.md,
              padding: spacing.md,
              width: 200,
              marginBottom: spacing.lg,
            }}
          />
          {wrong ? (
            <Text variant="small" color={colors.rose} style={{ marginBottom: spacing.md }}>
              not quite — {LOCKOUT_AFTER - lock.fails} tries left
            </Text>
          ) : null}
          <Button label="unlock" haptic="medium" disabled={pin.length < 4} onPress={() => void tryPin()} />
        </>
      )}

      {lock.biometricsAvailable ? (
        <View style={{ marginTop: spacing.lg }}>
          <Button label="use face / fingerprint" tone="ghost" onPress={() => void lock.unlockWithBiometrics()} />
        </View>
      ) : null}
    </View>
  );
}

/** PIN-only phones cool down rather than dead-end (model.ts LOCKOUT_COOLDOWN_MS). */
function CooldownMessage({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <Text variant="body" color={colors.gold} style={{ textAlign: 'center' }}>
      take a breath — try again in {secs}s
    </Text>
  );
}
