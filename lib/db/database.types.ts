export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      albums: {
        Row: {
          couple_id: string
          cover_photo_id: string | null
          created_at: string
          id: string
          op_id: string | null
          title: string
        }
        Insert: {
          couple_id: string
          cover_photo_id?: string | null
          created_at?: string
          id?: string
          op_id?: string | null
          title: string
        }
        Update: {
          couple_id?: string
          cover_photo_id?: string | null
          created_at?: string
          id?: string
          op_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "albums_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      bucket_list: {
        Row: {
          category: string
          couple_id: string
          created_at: string
          done_at: string | null
          done_photo_id: string | null
          id: string
          op_id: string | null
          title: string
          votes: Json
        }
        Insert: {
          category?: string
          couple_id: string
          created_at?: string
          done_at?: string | null
          done_photo_id?: string | null
          id?: string
          op_id?: string | null
          title: string
          votes?: Json
        }
        Update: {
          category?: string
          couple_id?: string
          created_at?: string
          done_at?: string | null
          done_photo_id?: string | null
          id?: string
          op_id?: string | null
          title?: string
          votes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bucket_list_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_strokes: {
        Row: {
          author_id: string
          color: string
          couple_id: string
          created_at: string
          id: string
          op_id: string | null
          points: Json
          seq: number
          width: number
        }
        Insert: {
          author_id: string
          color: string
          couple_id: string
          created_at?: string
          id?: string
          op_id?: string | null
          points: Json
          seq: number
          width: number
        }
        Update: {
          author_id?: string
          color?: string
          couple_id?: string
          created_at?: string
          id?: string
          op_id?: string | null
          points?: Json
          seq?: number
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "canvas_strokes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_strokes_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          anniversary_date: string | null
          created_at: string
          id: string
          invite_code: string
        }
        Insert: {
          anniversary_date?: string | null
          created_at?: string
          id?: string
          invite_code: string
        }
        Update: {
          anniversary_date?: string | null
          created_at?: string
          id?: string
          invite_code?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          couple_id: string
          created_at: string
          date: string
          id: string
          op_id: string | null
          recurring: boolean
          remind_days_before: number
          title: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          date: string
          id?: string
          op_id?: string | null
          recurring?: boolean
          remind_days_before?: number
          title: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          date?: string
          id?: string
          op_id?: string | null
          recurring?: boolean
          remind_days_before?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      game_moves: {
        Row: {
          author_id: string
          created_at: string
          id: string
          op_id: string | null
          payload: Json
          seq: number
          session_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          op_id?: string | null
          payload: Json
          seq: number
          session_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          op_id?: string | null
          payload?: Json
          seq?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_moves_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_moves_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          couple_id: string
          created_at: string
          id: string
          kind: string
          op_id: string | null
          score_a: number
          score_b: number
          state: Json
          status: string
          turn_user_id: string | null
        }
        Insert: {
          couple_id: string
          created_at?: string
          id?: string
          kind: string
          op_id?: string | null
          score_a?: number
          score_b?: number
          state?: Json
          status?: string
          turn_user_id?: string | null
        }
        Update: {
          couple_id?: string
          created_at?: string
          id?: string
          kind?: string
          op_id?: string | null
          score_a?: number
          score_b?: number
          state?: Json
          status?: string
          turn_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_turn_user_id_fkey"
            columns: ["turn_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          author_id: string
          body: string
          couple_id: string
          created_at: string
          id: string
          mood: string | null
          op_id: string | null
          photo_id: string | null
          visibility: string
        }
        Insert: {
          author_id: string
          body?: string
          couple_id: string
          created_at?: string
          id?: string
          mood?: string | null
          op_id?: string | null
          photo_id?: string | null
          visibility?: string
        }
        Update: {
          author_id?: string
          body?: string
          couple_id?: string
          created_at?: string
          id?: string
          mood?: string | null
          op_id?: string | null
          photo_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      letters: {
        Row: {
          audio_url: string | null
          author_id: string
          body: string
          couple_id: string
          created_at: string
          id: string
          label: string
          lock_type: string
          op_id: string | null
          opened_at: string | null
          unlock_at: string | null
          unlock_mood: string | null
        }
        Insert: {
          audio_url?: string | null
          author_id: string
          body?: string
          couple_id: string
          created_at?: string
          id?: string
          label: string
          lock_type?: string
          op_id?: string | null
          opened_at?: string | null
          unlock_at?: string | null
          unlock_mood?: string | null
        }
        Update: {
          audio_url?: string | null
          author_id?: string
          body?: string
          couple_id?: string
          created_at?: string
          id?: string
          label?: string
          lock_type?: string
          op_id?: string | null
          opened_at?: string | null
          unlock_at?: string | null
          unlock_mood?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "letters_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      moods: {
        Row: {
          author_id: string
          couple_id: string
          created_at: string
          id: string
          mood: string
          op_id: string | null
        }
        Insert: {
          author_id: string
          couple_id: string
          created_at?: string
          id?: string
          mood: string
          op_id?: string | null
        }
        Update: {
          author_id?: string
          couple_id?: string
          created_at?: string
          id?: string
          mood?: string
          op_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moods_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moods_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          prefs: Json
          profile_id: string
        }
        Insert: {
          prefs?: Json
          profile_id: string
        }
        Update: {
          prefs?: Json
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          album_id: string | null
          author_id: string
          caption: string
          couple_id: string
          created_at: string
          id: string
          op_id: string | null
          storage_path: string
          taken_at: string | null
        }
        Insert: {
          album_id?: string | null
          author_id: string
          caption?: string
          couple_id: string
          created_at?: string
          id?: string
          op_id?: string | null
          storage_path: string
          taken_at?: string | null
        }
        Update: {
          album_id?: string | null
          author_id?: string
          caption?: string
          couple_id?: string
          created_at?: string
          id?: string
          op_id?: string | null
          storage_path?: string
          taken_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          couple_id: string | null
          created_at: string
          display_name: string
          id: string
          last_seen_at: string | null
          nickname: string
          push_token: string | null
        }
        Insert: {
          avatar_url?: string | null
          couple_id?: string | null
          created_at?: string
          display_name?: string
          id: string
          last_seen_at?: string | null
          nickname?: string
          push_token?: string | null
        }
        Update: {
          avatar_url?: string | null
          couple_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          last_seen_at?: string | null
          nickname?: string
          push_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_answers: {
        Row: {
          author_id: string
          choice_index: number
          created_at: string
          id: string
          op_id: string | null
          question_id: string
        }
        Insert: {
          author_id: string
          choice_index: number
          created_at?: string
          id?: string
          op_id?: string | null
          question_id: string
        }
        Update: {
          author_id?: string
          choice_index?: number
          created_at?: string
          id?: string
          op_id?: string | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          answer_index: number
          author_id: string
          couple_id: string
          created_at: string
          id: string
          op_id: string | null
          options: Json
          prompt: string
        }
        Insert: {
          answer_index: number
          author_id: string
          couple_id: string
          created_at?: string
          id?: string
          op_id?: string | null
          options: Json
          prompt: string
        }
        Update: {
          answer_index?: number
          author_id?: string
          couple_id?: string
          created_at?: string
          id?: string
          op_id?: string | null
          options?: Json
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_notes: {
        Row: {
          author_id: string
          couple_id: string
          created_at: string
          duration_ms: number
          heard_at: string | null
          id: string
          op_id: string | null
          storage_path: string
        }
        Insert: {
          author_id: string
          couple_id: string
          created_at?: string
          duration_ms?: number
          heard_at?: string | null
          id?: string
          op_id?: string | null
          storage_path: string
        }
        Update: {
          author_id?: string
          couple_id?: string
          created_at?: string
          duration_ms?: number
          heard_at?: string | null
          id?: string
          op_id?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_notes_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bucket_vote: {
        Args: { p_item_id: string; p_on: boolean }
        Returns: undefined
      }
      create_couple: {
        Args: { p_display_name?: string; p_invite_code: string }
        Returns: string
      }
      join_couple: { Args: { p_invite_code: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ── hearts convenience aliases (appended after `npm run db:types`) ─────────
// The CLI generates the Database shape above. Check constraints don't become
// literal unions, so the unions are declared here and cast at the few
// boundaries that need them (documented in MANIFEST).
export type LetterLockType = 'anytime' | 'date' | 'mood';
export type GameKind = 'hangman' | 'battleship' | 'quiz' | 'cards';
export type GameStatus = 'active' | 'finished' | 'abandoned';
export type JournalVisibility = 'shared' | 'private';

export type CoupleRow = Tables<'couples'>;
export type ProfileRow = Tables<'profiles'>;
export type MoodRow = Tables<'moods'>;
export type LetterRow = Tables<'letters'>;
export type AlbumRow = Tables<'albums'>;
export type PhotoRow = Tables<'photos'>;
export type VoiceNoteRow = Tables<'voice_notes'>;
export type CanvasStrokeRow = Tables<'canvas_strokes'>;
export type GameSessionRow = Tables<'game_sessions'>;
export type GameMoveRow = Tables<'game_moves'>;
export type QuizQuestionRow = Tables<'quiz_questions'>;
export type QuizAnswerRow = Tables<'quiz_answers'>;
export type BucketItemRow = Tables<'bucket_list'>;
export type EventRow = Tables<'events'>;
export type JournalEntryRow = Tables<'journal_entries'>;
export type NotificationPrefsRow = Tables<'notification_prefs'>;
