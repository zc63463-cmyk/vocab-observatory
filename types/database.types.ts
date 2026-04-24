export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
          rating: ReviewRating;
          reviewed_at: string;
          scheduled_days: number | null;
          session_id: string | null;
          stability: number | null;
          state: string;
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
          rating: ReviewRating;
          reviewed_at?: string;
          scheduled_days?: number | null;
          session_id?: string | null;
          stability?: number | null;
          state: string;
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
      words: {
        Row: {
          aliases: string[];
          body_md: string;
          cefr: string | null;
          content_hash: string;
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
          short_definition: string | null;
          slug: string;
          source_path: string;
          source_updated_at: string | null;
          synced_at: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          aliases?: string[];
          body_md: string;
          cefr?: string | null;
          content_hash: string;
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
          short_definition?: string | null;
          slug: string;
          source_path: string;
          source_updated_at?: string | null;
          synced_at?: string;
          title: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["words"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      review_rating: ReviewRating;
    };
    CompositeTypes: Record<string, never>;
  };
}
