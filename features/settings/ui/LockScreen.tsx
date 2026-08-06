// features/settings/ui/LockScreen.tsx — the opaque lock overlay (§7.17).
// Rendered above everything while locked; biometrics first, PIN fallback.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text, Button, Card, Input, Icon } from '../../../ui';
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
      <View style={{ width: '100%', alignItems: 'center', gap: spacing.xl }}>
        <View style={{ alignItems: 'center', gap: spacing.lg }}>
          <View
            style={{
              width: spacing.huge,
              height: spacing.huge,
              borderRadius: radius.pill,
              backgroundColor: colors.blueSoft,
              borderWidth: 3,
              borderColor: colors.blue,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="lock" color={colors.blue} />
          </View>
          <Text variant="display" style={{ textAlign: 'center' }}>
            hearts is locked
          </Text>
        </View>

        {lock.lockedOut ? (
          <Card
            variant="danger"
            style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          >
            <Icon name="alert" size={spacing.xl} color={colors.danger} />
            <Text
              variant="small"
              color={colors.danger}
              accessibilityLiveRegion="polite"
              style={{ flex: 1 }}
            >
              too many wrong tries. use your face or fingerprint to get back in
            </Text>
          </Card>
        ) : lock.cooldownUntil ? (
          <CooldownMessage until={lock.cooldownUntil} />
        ) : (
          <View style={{ alignSelf: 'stretch', gap: spacing.lg }}>
            <Input
              code
              placeholder="your PIN"
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              error={wrong ? `not quite. ${LOCKOUT_AFTER - lock.fails} tries left` : null}
            />
            <Button
              label="unlock"
              size="lg"
              haptic="medium"
              disabled={pin.length < 4}
              onPress={() => void tryPin()}
            />
          </View>
        )}

        {lock.biometricsAvailable ? (
          <Button
            label="use face / fingerprint"
            tone="ghost"
            onPress={() => void lock.unlockWithBiometrics()}
            style={{ alignSelf: 'stretch' }}
          />
        ) : null}
      </View>
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
    <Card variant="quiet" style={{ alignSelf: 'stretch' }}>
      <Text
        variant="body"
        color={colors.silver}
        accessibilityLiveRegion="polite"
        style={{ textAlign: 'center' }}
      >
        take a breath. try again in {secs}s
      </Text>
    </Card>
  );
}
