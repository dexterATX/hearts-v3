// app/(tabs)/us.tsx — the "us" tab: photos, voice, journal, bucket, events,
// companion (§7.11–7.16). Thin: compose slices in sections.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../ui';
import { colors, spacing, radius } from '../../theme/theme';
import { usePublishPresence } from '../../features/presence';
import { PhotoGrid, AlbumsRail, usePhotoSync, useAddPhoto, useAddAlbum } from '../../features/photos';
import { VoiceList, useVoiceSync } from '../../features/voice';
import { JournalList, useJournalSync } from '../../features/journal';
import { BucketListView, useBucketSync } from '../../features/bucket';
import { EventsView, useEventSync, useEventReminders } from '../../features/events';
import { CompanionScreen } from '../../features/ai';

const SECTIONS = [
  { key: 'photos', label: '📷 photos' },
  { key: 'voice', label: '🎙️ voice' },
  { key: 'journal', label: '📔 journal' },
  { key: 'bucket', label: '🌟 bucket list' },
  { key: 'events', label: '📅 days' },
  { key: 'companion', label: '✨ companion' },
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

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <View style={{ paddingVertical: spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg }}>
          {SECTIONS.map((s) => (
            <Pressable key={s.key} onPress={() => setSection(s.key)} style={{ marginRight: spacing.sm }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: section === s.key ? colors.rose : colors.line,
                  borderRadius: radius.lg,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                  backgroundColor: section === s.key ? colors.surfaceAlt : colors.surface,
                }}
              >
                <Text variant="small" color={section === s.key ? colors.rose : colors.muted}>
                  {s.label}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {section === 'photos' ? (
        <View style={{ flex: 1 }}>
          <AlbumsRail activeAlbumId={albumFilter} onPick={setAlbumFilter} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', paddingBottom: spacing.sm }}>
            <Pressable onPress={() => void pickAndUpload(albumFilter, '')}>
              <Text variant="small" color={colors.rose} style={{ marginRight: spacing.xl }}>
                ＋ add a photo
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const title = `album ${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${new Date().getFullYear()}`;
                void addAlbum(title);
              }}
            >
              <Text variant="small" color={colors.gold}>
                ＋ new album
              </Text>
            </Pressable>
          </View>
          {uploads.some((u) => u.status === 'uploading') ? (
            <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', paddingBottom: spacing.sm }}>
              uploading… {Math.round((uploads.find((u) => u.status === 'uploading')?.progress ?? 0) * 100)}%
            </Text>
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
