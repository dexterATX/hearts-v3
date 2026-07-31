// features/settings/ui/SettingsScreen.tsx — nicknames, anniversary, toggles,
// PIN + biometric, full export (§7.17).
import { useState } from 'react';
import { View, TextInput, ScrollView, Switch } from 'react-native';
import { Text, Card, Button } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import { useSession } from '../../../lib/session/store';
import { closeBus } from '../../../lib/sync/bus';
import { signOut } from '../api';
import { usePrefs, useTogglePref, useSaveProfile, useAppLock, useExport } from '../hooks';
import { PREF_KEYS, validAnniversary, exportFileName } from '../model';

function NamesCard() {
  const me = useSession((s) => s.me);
  const { saveNames } = useSaveProfile();
  const [displayName, setDisplayName] = useState(me?.display_name ?? '');
  const [nickname, setNickname] = useState(me?.nickname ?? '');
  const [saved, setSaved] = useState(false);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.sm }}>
        what you are called here
      </Text>
      <TextInput
        placeholder="your name"
        placeholderTextColor={colors.muted}
        value={displayName}
        onChangeText={setDisplayName}
        style={{
          color: colors.ink,
          borderBottomWidth: 1,
          borderColor: colors.line,
          paddingVertical: spacing.sm,
          marginBottom: spacing.sm,
          fontSize: 15,
        }}
      />
      <TextInput
        placeholder="what she calls you"
        placeholderTextColor={colors.muted}
        value={nickname}
        onChangeText={setNickname}
        style={{
          color: colors.ink,
          borderBottomWidth: 1,
          borderColor: colors.line,
          paddingVertical: spacing.sm,
          marginBottom: spacing.md,
          fontSize: 15,
        }}
      />
      <Button
        label={saved ? 'saved ♥' : 'save names'}
        tone="ghost"
        onPress={() =>
          void saveNames(displayName, nickname).then((okSave) => {
            if (okSave) {
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            }
          })
        }
      />
    </Card>
  );
}

function AnniversaryCard() {
  const coupleId = useSession((s) => s.coupleId);
  const { saveAnniversary } = useSaveProfile();
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.sm }}>
        the day it started — this powers the home counter
      </Text>
      <TextInput
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.muted}
        value={date}
        onChangeText={setDate}
        autoCapitalize="none"
        style={{
          color: colors.ink,
          borderBottomWidth: 1,
          borderColor: colors.line,
          paddingVertical: spacing.sm,
          marginBottom: spacing.md,
          fontSize: 15,
        }}
      />
      {error ? (
        <Text variant="small" color={colors.rose} style={{ marginBottom: spacing.sm }}>
          {error}
        </Text>
      ) : null}
      <Button
        label="set our day"
        tone="ghost"
        disabled={!coupleId || !date}
        onPress={() => {
          if (!validAnniversary(date)) {
            setError('that date does not look real — YYYY-MM-DD, not in the future');
            return;
          }
          setError(null);
          void saveAnniversary(date);
        }}
      />
    </Card>
  );
}

function TogglesCard() {
  const prefs = usePrefs();
  const toggle = useTogglePref();
  const row = prefs.data ?? null;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.md }}>
        which pings may reach your phone
      </Text>
      {PREF_KEYS.map((p) => {
        const on = ((row?.prefs ?? {}) as Record<string, boolean>)[p.key] !== false;
        return (
          <View
            key={p.key}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: spacing.sm,
            }}
          >
            <Text variant="body">{p.label}</Text>
            <Switch
              value={on}
              onValueChange={(v) => void toggle(p.key, v)}
              trackColor={{ false: colors.line, true: colors.roseDeep }}
              thumbColor={colors.ink}
            />
          </View>
        );
      })}
    </Card>
  );
}

function LockCard() {
  const lock = useAppLock();
  const [pin, setPin] = useState('');
  const [set, setDone] = useState(false);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.sm }}>
        the heart-lock — {lock.biometricsAvailable ? 'face/fingerprint + your PIN' : 'a PIN only your two phones know'}
      </Text>
      {lock.configured ? (
        <Text variant="small" color={colors.rose}>
          {set ? 'PIN updated ♥' : 'the lock is on — the app locks whenever it leaves the screen'}
        </Text>
      ) : (
        <Text variant="caption" color={colors.muted} style={{ marginBottom: spacing.sm }}>
          set a 4-6 digit PIN; biometrics unlock it when your phone has them
        </Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
        <TextInput
          placeholder={lock.configured ? 'new PIN' : 'choose a PIN'}
          placeholderTextColor={colors.muted}
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          style={{
            flex: 1,
            color: colors.ink,
            borderBottomWidth: 1,
            borderColor: colors.line,
            paddingVertical: spacing.sm,
            fontSize: 17,
            letterSpacing: 4,
            marginRight: spacing.md,
          }}
        />
        <Button
          label={lock.configured ? 'change' : 'set'}
          tone="ghost"
          disabled={pin.length < 4}
          onPress={() =>
            void lock.setPin(pin).then(() => {
              setPin('');
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            })
          }
        />
      </View>
    </Card>
  );
}

function ExportCard() {
  const { run, busy, error, savedTo } = useExport();

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.sm }}>
        everything, in your hands — moods, letters, journal, games, all of it ({exportFileName()}).
        you pick the folder; the file lands there.
      </Text>
      {error ? (
        <Text variant="small" color={colors.rose} style={{ marginBottom: spacing.sm }}>
          {error}
        </Text>
      ) : null}
      {savedTo ? (
        <Text variant="small" color={colors.rose} style={{ marginBottom: spacing.sm }}>
          saved as {savedTo} ♥
        </Text>
      ) : null}
      <Button label={busy ? 'gathering us up…' : 'export everything'} tone="gold" disabled={busy} onPress={() => void run()} />
    </Card>
  );
}

export function SettingsScreen() {
  const onSignOut = async () => {
    const res = await signOut();
    if (res.ok) {
      closeBus();
      useSession.getState().reset();
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl }}>
      <Text variant="title" style={{ marginBottom: spacing.xl }}>
        settings
      </Text>
      <NamesCard />
      <AnniversaryCard />
      <TogglesCard />
      <LockCard />
      <ExportCard />
      <View style={{ marginTop: spacing.lg }}>
        <Button label="sign out of this phone" tone="ghost" onPress={() => void onSignOut()} />
      </View>
    </ScrollView>
  );
}
