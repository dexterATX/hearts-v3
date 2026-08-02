// features/settings/ui/SettingsScreen.tsx — nicknames, anniversary, toggles,
// PIN + biometric, full export (§7.17).
import { useState, type ReactNode } from 'react';
import { View, ScrollView, Switch } from 'react-native';
import { Text, Card, Button, Input, Icon } from '../../../ui';
import { colors, spacing } from '../../../theme/theme';
import { useSession, usePartnerName } from '../../../lib/session/store';
import { closeBus } from '../../../lib/sync/bus';
import { pauseOutbox, resumeOutbox } from '../../../lib/sync/outbox';
import { signOut } from '../api';
import { usePrefs, useTogglePref, useSaveProfile, useAppLock, useExport } from '../hooks';
import { PREF_KEYS, validAnniversary, exportFileName } from '../model';

/** An overline label over a card — the whole screen is one long list, and
 *  without section headers every row reads at the same weight. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="overline" color={colors.muted} style={{ textTransform: 'uppercase' }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function NamesCard() {
  const me = useSession((s) => s.me);
  const partnerName = usePartnerName();
  const { saveNames } = useSaveProfile();
  const [displayName, setDisplayName] = useState(me?.display_name ?? '');
  const [nickname, setNickname] = useState(me?.nickname ?? '');
  const [saved, setSaved] = useState(false);

  return (
    <Card style={{ gap: spacing.md }}>
      <Text variant="small" color={colors.muted}>
        what you are called here
      </Text>
      <Input placeholder="your name" value={displayName} onChangeText={setDisplayName} />
      <Input
        placeholder={`what ${partnerName} calls you`}
        value={nickname}
        onChangeText={setNickname}
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
    <Card style={{ gap: spacing.md }}>
      <Text variant="small" color={colors.muted}>
        the day it started — this powers the home counter
      </Text>
      <Input
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        autoCapitalize="none"
        error={error}
      />
      <Button
        label="set our day"
        tone="ghost"
        icon="calendar"
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
    <Card>
      <Text variant="small" color={colors.muted} style={{ marginBottom: spacing.sm }}>
        which pings may reach your phone
      </Text>
      {PREF_KEYS.map((p, i) => {
        const on = ((row?.prefs ?? {}) as Record<string, boolean>)[p.key] !== false;
        return (
          <View
            key={p.key}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: spacing.md,
              borderTopWidth: i === 0 ? 0 : 3,
              borderTopColor: colors.line,
            }}
          >
            <Text variant="body">{p.label}</Text>
            <Switch
              value={on}
              onValueChange={(v) => void toggle(p.key, v)}
              accessibilityLabel={p.label}
              trackColor={{ false: colors.line, true: colors.blueDeep }}
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
    <Card style={{ gap: spacing.md }}>
      <Text variant="small" color={colors.muted}>
        the heart-lock — {lock.biometricsAvailable ? 'face/fingerprint + your PIN' : 'a PIN only your two phones know'}
      </Text>
      {lock.configured ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon
            name={set ? 'check' : 'lock'}
            size={spacing.lg}
            color={set ? colors.success : colors.blue}
          />
          <Text variant="small" color={set ? colors.success : colors.blue} style={{ flex: 1 }}>
            {set ? 'PIN updated ♥' : 'the lock is on — the app locks whenever it leaves the screen'}
          </Text>
        </View>
      ) : (
        <Text variant="caption" color={colors.muted}>
          set a 4-6 digit PIN; biometrics unlock it when your phone has them
        </Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Input
            placeholder={lock.configured ? 'new PIN' : 'choose a PIN'}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />
        </View>
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
    <Card style={{ gap: spacing.md }}>
      <Text variant="small" color={colors.muted}>
        everything, in your hands — moods, letters, journal, games, all of it ({exportFileName()}).
        you pick the folder; the file lands there.
      </Text>
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name="alert" size={spacing.lg} color={colors.danger} />
          <Text
            variant="small"
            color={colors.danger}
            accessibilityLiveRegion="polite"
            style={{ flex: 1 }}
          >
            {error}
          </Text>
        </View>
      ) : null}
      {savedTo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name="check" size={spacing.lg} color={colors.success} />
          <Text
            variant="small"
            color={colors.success}
            accessibilityLiveRegion="polite"
            style={{ flex: 1 }}
          >
            saved as {savedTo} ♥
          </Text>
        </View>
      ) : null}
      <Button
        label={busy ? 'gathering us up…' : 'export everything'}
        tone="secondary"
        loading={busy}
        disabled={busy}
        onPress={() => void run()}
      />
    </Card>
  );
}

export function SettingsScreen() {
  const onSignOut = async () => {
    pauseOutbox(); // queued writes must not flush unauthenticated (they'd 42501 and be deleted)
    const res = await signOut();
    if (res.ok) {
      closeBus();
      useSession.getState().reset();
    } else {
      resumeOutbox();
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.xl,
        paddingBottom: spacing.huge,
        gap: spacing.xl,
      }}
    >
      <Text variant="display" style={{ marginBottom: spacing.sm }}>
        settings
      </Text>
      <Section label="names">
        <NamesCard />
      </Section>
      <Section label="our day">
        <AnniversaryCard />
      </Section>
      <Section label="pings">
        <TogglesCard />
      </Section>
      <Section label="the lock">
        <LockCard />
      </Section>
      <Section label="export">
        <ExportCard />
      </Section>
      <View style={{ height: 1, backgroundColor: colors.line }} />
      <Button label="sign out of this phone" tone="danger" onPress={() => void onSignOut()} />
    </ScrollView>
  );
}
