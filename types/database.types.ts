export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Type-safe cast from a structured object to Json for Supabase inserts.
 * Supabase's generated Json type uses index signatures that don't accept
 * concrete interfaces. This function provides a single, audited boundary
 * for the necessary cast — replacing scattered `as unknown as Json` escapes.
 *
 * IMPORTANT: Only use this with data that is genuinely JSON-serializable
 * (plain objects, arrays, primitives — no functions, Dates, undefined, etc.).
 */
export function asJson(value: unknown): Json {
  return value as Json;
}

export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface Database {
  public: {
    Tables: {
      import_errors: {
        Row: {
          created_at: string;
          error_message: string;
          error_stage: string;
          id: string;
          raw_excerpt: string | null;
          run_id: string | null;
          source_path: string | null;
        };
        Insert: {
          created_at?: string;
          error_message: string;
          error_stage: string;
          id?: string;
          raw_excerpt?: string | null;
          run_id?: string | null;
          source_path?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["import_errors"]["Insert"]>;
        Relationships: [];
      };
      import_runs: {
        Row: {
          created_at: string;
          created_count: number;
          error_count: number;
          finished_at: string | null;
          id: string;
          imported_count: number;
          repo_branch: string | null;
          repo_name: string | null;
          repo_owner: string | null;
          soft_deleted_count: number;
          source: string;
          started_at: string;
          status: string;
          summary: Json;
          tags_count: number;
          trigger_type: string;
          unchanged_count: number;
          updated_count: number;
        };
        Insert: {
          created_at?: string;
          created_count?: number;
          error_count?: number;
          finished_at?: string | null;
          id?: string;
          imported_count?: number;
          repo_branch?: string | null;
          repo_name?: string | null;
          repo_owner?: string | null;
          soft_deleted_count?: number;
          source: string;
          started_at?: string;
          status: string;
          summary?: Json;
          tags_count?: number;
          trigger_type: string;
          unchanged_count?: number;
          updated_count?: number;
        };
        Update: Partial<Database["public"]["Tables"]["import_runs"]["Insert"]>;
        Relationships: [];
      };
      collection_notes: {
        Row: {
          body_md: string;
          content_hash: string;
          created_at: string;
          id: string;
          is_deleted: boolean;
          is_published: boolean;
          kind: string;
          metadata: Json;
          related_word_slugs: string[];
          slug: string;
          source_path: string;
          source_updated_at: string | null;
          summary: string | null;
          synced_at: string;
          tags: string[];
          title: string;
          updated_at: string;
        };
        Insert: {
          body_md: string;
          content_hash: string;
          created_at?: string;
          id?: string;
          is_deleted?: boolean;
          is_published?: boolean;
          kind: string;
          metadata?: Json;
          related_word_slugs?: string[];
          slug: string;
          source_path: string;
          source_updated_at?: string | null;
          summary?: string | null;
          synced_at?: string;
          tags?: string[];
          title: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["collection_notes"]["Insert"]>;
        Relationships: [];
      };
      note_revisions: {
        Row: {
          content_md: string;
          created_at: string;
          id: string;
          note_id: string;
          user_id: string;
          version: number;
          word_id: string;
        };
        Insert: {
          content_md?: string;
          created_at?: string;
          id?: string;
          note_id: string;
          user_id: string;
          version: number;
          word_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["note_revisions"]["Insert"]>;
        Relationships: [];
      };
      notes: {
        Row: {
          content_md: string;
          created_at: string;
          id: string;
          updated_at: string;
          user_id: string;
          version: number;
          word_id: string;
        };
        Insert: {
          content_md?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
          version?: number;
          word_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["notes"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          role: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          role?: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      review_logs: {
        Row: {
          created_at: string;
          difficulty: number | null;
          due_at: string | null;
          elapsed_days: number | null;
          id: string;
          metadata: Json;
          previous_progress_snapshot: Json;
          progress_id: string | null;
          rating: ReviewRating;
          reviewed_at: string;
          scheduled_days: number | null;
          session_id: string | null;
          stability: number | null;
          state: string;
          undone: boolean;
          undone_at: string | null;
          user_id: string;
          word_id: string;
        };
        Insert: {
          created_at?: string;
          difficulty?: number | null;
          due_at?: string | null;
          elapsed_days?: number | null;
          id?: string;
          metadata?: Json;
          previous_progress_snapshot?: Json;
          progress_id?: string | null;
          rating: ReviewRating;
          reviewed_at?: string;
          scheduled_days?: number | null;
          session_id?: string | null;
          stability?: number | null;
          state: string;
          undone?: boolean;
          undone_at?: string | null;
          user_id: string;
          word_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["review_logs"]["Insert"]>;
        Relationships: [];
      };
      sessions: {
        Row: {
          cards_seen: number;
          created_at: string;
          ended_at: string | null;
          id: string;
          mode: string;
          started_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cards_seen?: number;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          mode?: string;
          started_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
        Relationships: [];
      };
      tags: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          label: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          label: string;
          slug: string;
        };
        Update: Partial<Database["public"]["Tables"]["tags"]["Insert"]>;
        Relationships: [];
      };
      user_word_progress: {
        Row: {
          again_count: number;
          content_hash_snapshot: string | null;
          created_at: string;
          desired_retention: number;
          difficulty: number | null;
          due_at: string | null;
          easy_count: number;
          good_count: number;
          hard_count: number;
          id: string;
          interval_days: number | null;
          lapse_count: number;
          last_rating: ReviewRating | null;
          last_reviewed_at: string | null;
          retrievability: number | null;
          review_count: number;
          schedule_algo: string;
          scheduler_payload: Json;
          stability: number | null;
          state: string;
          updated_at: string;
          user_id: string;
          word_id: string;
        };
        Insert: {
          again_count?: number;
          content_hash_snapshot?: string | null;
          created_at?: string;
          desired_retention?: number;
          difficulty?: number | null;
          due_at?: string | null;
          easy_count?: number;
          good_count?: number;
          hard_count?: number;
          id?: string;
          interval_days?: number | null;
          lapse_count?: number;
          last_rating?: ReviewRating | null;
          last_reviewed_at?: string | null;
          retrievability?: number | null;
          review_count?: number;
          schedule_algo?: string;
          scheduler_payload?: Json;
          stability?: number | null;
          state?: string;
          updated_at?: string;
          user_id: string;
          word_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_word_progress"]["Insert"]>;
        Relationships: [];
      };
      word_tags: {
        Row: {
          tag_id: string;
          word_id: string;
        };
        Insert: {
          tag_id: string;
          word_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["word_tags"]["Insert"]>;
        Relationships: [];
      };
      word_filter_facets: {
        Row: {
          count: number;
          dimension: string;
          updated_at: string;
          value: string;
        };
        Insert: {
          count?: number;
          dimension: string;
          updated_at?: string;
          value: string;
        };
        Update: Partial<Database["public"]["Tables"]["word_filter_facets"]["Insert"]>;
        Relationships: [];
      };
      words: {
        Row: {
          aliases: string[];
          antonym_items: Json;
          body_md: string;
          cefr: string | null;
          collocations: Json;
          content_hash: string;
          core_definitions: Json;
          corpus_items: Json;
          created_at: string;
          definition_md: string;
          examples: Json;
          id: string;
          ipa: string | null;
          is_deleted: boolean;
          is_published: boolean;
          lang_code: string;
          lemma: string;
          metadata: Json;
          pos: string | null;
          prototype_text: string | null;
          short_definition: string | null;
          slug: string;
          source_path: string;
          source_updated_at: string | null;
          synonym_items: Json;
          synced_at: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          aliases?: string[];
          antonym_items?: Json;
          body_md: string;
          cefr?: string | null;
          collocations?: Json;
          content_hash: string;
          core_definitions?: Json;
          corpus_items?: Json;
          created_at?: string;
          definition_md: string;
          examples?: Json;
          id?: string;
          ipa?: string | null;
          is_deleted?: boolean;
          is_published?: boolean;
          lang_code?: string;
          lemma: string;
          metadata?: Json;
          pos?: string | null;
          prototype_text?: string | null;
          short_definition?: string | null;
          slug: string;
          source_path: string;
          source_updated_at?: string | null;
          synonym_items?: Json;
          synced_at?: string;
          title: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["words"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      undo_review_log: {
        Args: {
          p_review_log_id: string;
          p_user_id: string;
          p_session_id: string;
        };
        Returns: {
          out_success: boolean;
          out_progress_id: string | null;
          out_word_id: string | null;
          out_error_message: string | null;
        }[];
      };
    };
    Enums: {
      review_rating: ReviewRating;
    };
    CompositeTypes: Record<string, never>;
  };
}
