// lib/db/database.types.ts — hand-written to match supabase/migrations/0001_init.sql.
// REGENERATE against the live project once linked:
//   supabase gen types typescript --linked --schema public > lib/db/database.types.ts
// This file exists so the project typechecks before the CLI is linked.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Table<R, I = Partial<R>, U = Partial<R>> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: Rel[];
};

// ── row shapes ─────────────────────────────────────────────────────────
export type CoupleRow = {
  id: string;
  invite_code: string;
  anniversary_date: string | null;
  created_at: string;
};
export type ProfileRow = {
  id: string;
  couple_id: string | null;
  display_name: string;
  nickname: string;
  avatar_url: string | null;
  push_token: string | null;
  last_seen_at: string | null;
  created_at: string;
};
export type MoodRow = {
  id: string;
  couple_id: string;
  author_id: string;
  mood: string;
  op_id: string | null;
  created_at: string;
};
export type LetterLockType = 'anytime' | 'date' | 'mood';
export type LetterRow = {
  id: string;
  couple_id: string;
  author_id: string;
  label: string;
  body: string;
  audio_url: string | null;
  lock_type: LetterLockType;
  unlock_at: string | null;
  unlock_mood: string | null;
  opened_at: string | null;
  op_id: string | null;
  created_at: string;
};
export type AlbumRow = {
  id: string;
  couple_id: string;
  title: string;
  cover_photo_id: string | null;
  op_id: string | null;
  created_at: string;
};
export type PhotoRow = {
  id: string;
  couple_id: string;
  author_id: string;
  album_id: string | null;
  storage_path: string;
  caption: string;
  taken_at: string | null;
  op_id: string | null;
  created_at: string;
};
export type VoiceNoteRow = {
  id: string;
  couple_id: string;
  author_id: string;
  storage_path: string;
  duration_ms: number;
  heard_at: string | null;
  op_id: string | null;
  created_at: string;
};
export type CanvasStrokeRow = {
  id: string;
  couple_id: string;
  author_id: string;
  seq: number;
  points: Json;
  color: string;
  width: number;
  op_id: string | null;
  created_at: string;
};
export type GameKind = 'hangman' | 'battleship' | 'quiz' | 'cards';
export type GameStatus = 'active' | 'finished' | 'abandoned';
export type GameSessionRow = {
  id: string;
  couple_id: string;
  kind: GameKind;
  status: GameStatus;
  turn_user_id: string | null;
  state: Json;
  score_a: number;
  score_b: number;
  op_id: string | null;
  created_at: string;
};
export type GameMoveRow = {
  id: string;
  session_id: string;
  author_id: string;
  seq: number;
  payload: Json;
  op_id: string | null;
  created_at: string;
};
export type QuizQuestionRow = {
  id: string;
  couple_id: string;
  author_id: string;
  prompt: string;
  options: Json;
  answer_index: number;
  op_id: string | null;
  created_at: string;
};
export type QuizAnswerRow = {
  id: string;
  question_id: string;
  author_id: string;
  choice_index: number;
  op_id: string | null;
  created_at: string;
};
export type BucketItemRow = {
  id: string;
  couple_id: string;
  title: string;
  category: string;
  done_at: string | null;
  done_photo_id: string | null;
  votes: Json;
  op_id: string | null;
  created_at: string;
};
export type EventRow = {
  id: string;
  couple_id: string;
  title: string;
  date: string;
  recurring: boolean;
  remind_days_before: number;
  op_id: string | null;
  created_at: string;
};
export type JournalVisibility = 'shared' | 'private';
export type JournalEntryRow = {
  id: string;
  couple_id: string;
  author_id: string;
  body: string;
  mood: string | null;
  visibility: JournalVisibility;
  photo_id: string | null;
  op_id: string | null;
  created_at: string;
};
export type NotificationPrefsRow = {
  profile_id: string;
  prefs: Json;
};

// ── Database ───────────────────────────────────────────────────────────
export type Database = {
  public: {
    Tables: {
      couples: Table<CoupleRow>;
      profiles: Table<ProfileRow>;
      moods: Table<MoodRow>;
      letters: Table<LetterRow>;
      albums: Table<AlbumRow>;
      photos: Table<PhotoRow>;
      voice_notes: Table<VoiceNoteRow>;
      canvas_strokes: Table<CanvasStrokeRow>;
      game_sessions: Table<GameSessionRow>;
      game_moves: Table<GameMoveRow>;
      quiz_questions: Table<QuizQuestionRow>;
      quiz_answers: Table<QuizAnswerRow>;
      bucket_list: Table<BucketItemRow>;
      events: Table<EventRow>;
      journal_entries: Table<JournalEntryRow>;
      notification_prefs: Table<NotificationPrefsRow>;
    };
    Views: Record<string, never>;
    Functions: {
      create_couple: { Args: { p_invite_code: string; p_display_name?: string }; Returns: string };
      join_couple: { Args: { p_invite_code: string }; Returns: string };
      bucket_vote: { Args: { p_item_id: string; p_on: boolean }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
  __InternalSupabase: { PostgrestVersion: '14.5' };
};

// convenience helpers mirroring the CLI-generated ones
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
