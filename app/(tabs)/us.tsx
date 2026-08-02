// app/(tabs)/us.tsx — the "us" tab: photos, voice, journal, bucket, events,
// companion (§7.11–7.16). Thin: compose slices in sections.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, Icon } from '../../ui';
import { colors, spacing, radius } from '../../theme/theme';
import { usePublishPresence } from '../../features/presence';
import { PhotoGrid, AlbumsRail, usePhotoSync, useAddPhoto, useAddAlbum } from '../../features/photos';
import { VoiceList, useVoiceSync } from '../../features/voice';
import { JournalList, useJournalSync } from '../../features/journal';
import { BucketListView, useBucketSync } from '../../features/bucket';
import { EventsView, useEventSync, useEventReminders } from '../../features/events';
import { CompanionScreen } from '../../features/ai';

const SECTIONS = [
  { key: 'photos', label: 'photos', icon: 'image' },
  { key: 'voice', label: 'voice', icon: 'mic' },
  { key: 'journal', label: 'journal', icon: 'book' },
  { key: 'bucket', label: 'bucket list', icon: 'check' },
  { key: 'events', label: 'days', icon: 'calendar' },
  { key: 'companion', label: 'companion', icon: 'sparkle' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

export default function UsTab() {
  usePublishPresence('us');
  usePhotoSync();
  useVoiceSync();
  useJournalSync();
  useBucketSync();
  useEventSync();
  useEventReminders();
  const [section, setSection] = useState<SectionKey>('photos');
  const [albumFilter, setAlbumFilter] = useState<string | null>(null);
  const { pickAndUpload, uploads } = useAddPhoto();
  const addAlbum = useAddAlbum();

  const uploading = uploads.find((u) => u.status === 'uploading');
  const percent = Math.round((uploading?.progress ?? 0) * 100);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <View style={{ paddingTop: spacing.md, paddingBottom: spacing.lg }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
        >
          {SECTIONS.map((s) => {
            const active = section === s.key;
            return (
              <Pressable
                key={s.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSection(s.key)}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
                    borderWidth: 3,
                    borderColor: active ? colors.blue : colors.line,
                    borderRadius: radius.pill,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    backgroundColor: active ? colors.blueSoft : colors.surface,
                  }}
                >
                  <Icon name={s.icon} size={spacing.lg} color={active ? colors.blue : colors.muted} />
                  <Text
                    variant="caption"
                    weight={active ? 'semibold' : 'medium'}
                    color={active ? colors.blue : colors.muted}
                  >
                    {s.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {section === 'photos' ? (
        <View style={{ flex: 1 }}>
          <AlbumsRail activeAlbumId={albumFilter} onPick={setAlbumFilter} />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: spacing.sm,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.md,
            }}
          >
            <Button label="add a photo" icon="image" onPress={() => void pickAndUpload(albumFilter, '')} />
            <Button
              label="new album"
              tone="ghost"
              icon="book"
              onPress={() => {
                const title = `album ${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${new Date().getFullYear()}`;
                void addAlbum(title);
              }}
            />
          </View>
          {uploading ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm }}>
              <Text variant="caption" color={colors.muted} style={{ textAlign: 'center' }}>
                uploading… {percent}%
              </Text>
              <View
                style={{
                  height: spacing.xs / 2,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surfaceAlt,
                  overflow: 'hidden',
                }}
              >
                <View style={{ width: `${percent}%`, height: '100%', backgroundColor: colors.blue }} />
              </View>
            </View>
          ) : null}
          <PhotoGrid albumId={albumFilter} />
        </View>
      ) : null}

      {section === 'voice' ? <VoiceList /> : null}
      {section === 'journal' ? <JournalList /> : null}
      {section === 'bucket' ? <BucketListView /> : null}
      {section === 'events' ? <EventsView /> : null}
      {section === 'companion' ? <CompanionScreen /> : null}
    </SafeAreaView>
  );
}
