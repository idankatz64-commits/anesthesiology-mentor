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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          role?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: string | null
        }
        Relationships: []
      }
      answer_history: {
        Row: {
          answered_at: string
          flagged_for_review: boolean | null
          id: string
          is_correct: boolean
          question_id: string
          topic: string | null
          user_id: string
        }
        Insert: {
          answered_at?: string
          flagged_for_review?: boolean | null
          id?: string
          is_correct: boolean
          question_id: string
          topic?: string | null
          user_id: string
        }
        Update: {
          answered_at?: string
          flagged_for_review?: boolean | null
          id?: string
          is_correct?: boolean
          question_id?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          id: string
          topic_main: string
          topic_num: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          topic_main: string
          topic_num?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          topic_main?: string
          topic_num?: number | null
        }
        Relationships: []
      }
      chapter_content: {
        Row: {
          chapter_number: number
          chapter_title: string
          content_md: string | null
          file_hash: string | null
          id: string
          keywords_md: string | null
          last_synced_at: string | null
        }
        Insert: {
          chapter_number: number
          chapter_title: string
          content_md?: string | null
          file_hash?: string | null
          id?: string
          keywords_md?: string | null
          last_synced_at?: string | null
        }
        Update: {
          chapter_number?: number
          chapter_title?: string
          content_md?: string | null
          file_hash?: string | null
          id?: string
          keywords_md?: string | null
          last_synced_at?: string | null
        }
        Relationships: []
      }
      chapter_gaps: {
        Row: {
          chapter_number: number
          chapter_title: string
          csv_used: boolean | null
          generated_at: string | null
          id: string
          missing_clinical_pearls: Json | null
          missing_drugs: Json | null
          missing_numbers: Json | null
          missing_topics: Json | null
          severity: string | null
          severity_reason: string | null
          summary_he: string | null
        }
        Insert: {
          chapter_number: number
          chapter_title: string
          csv_used?: boolean | null
          generated_at?: string | null
          id?: string
          missing_clinical_pearls?: Json | null
          missing_drugs?: Json | null
          missing_numbers?: Json | null
          missing_topics?: Json | null
          severity?: string | null
          severity_reason?: string | null
          summary_he?: string | null
        }
        Update: {
          chapter_number?: number
          chapter_title?: string
          csv_used?: boolean | null
          generated_at?: string | null
          id?: string
          missing_clinical_pearls?: Json | null
          missing_drugs?: Json | null
          missing_numbers?: Json | null
          missing_topics?: Json | null
          severity?: string | null
          severity_reason?: string | null
          summary_he?: string | null
        }
        Relationships: []
      }
      community_notes: {
        Row: {
          author_display: string
          created_at: string
          id: string
          note_text: string
          question_id: string
          user_id: string
        }
        Insert: {
          author_display?: string
          created_at?: string
          id?: string
          note_text: string
          question_id: string
          user_id: string
        }
        Update: {
          author_display?: string
          created_at?: string
          id?: string
          note_text?: string
          question_id?: string
          user_id?: string
        }
        Relationships: []
      }
      formulas: {
        Row: {
          category: string
          chapter: string
          clinical_note: string
          created_at: string | null
          equation: string
          formula_name: string
          id: string
          unit: string
          variables: string
        }
        Insert: {
          category: string
          chapter?: string
          clinical_note?: string
          created_at?: string | null
          equation?: string
          formula_name: string
          id: string
          unit?: string
          variables?: string
        }
        Update: {
          category?: string
          chapter?: string
          clinical_note?: string
          created_at?: string | null
          equation?: string
          formula_name?: string
          id?: string
          unit?: string
          variables?: string
        }
        Relationships: []
      }
      ideas: {
        Row: {
          content: string
          created_at: string
          id: string
          notes: string | null
          plan: string | null
          remind_at: string | null
          reviewed_at: string | null
          source: string
          status: Database["public"]["Enums"]["idea_status"]
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          notes?: string | null
          plan?: string | null
          remind_at?: string | null
          reviewed_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["idea_status"]
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          notes?: string | null
          plan?: string | null
          remind_at?: string | null
          reviewed_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["idea_status"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_admin: boolean
          is_editor: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          is_admin?: boolean
          is_editor?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_admin?: boolean
          is_editor?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      question_audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          field_changed: string
          id: string
          new_value: string | null
          old_value: string | null
          question_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field_changed: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          question_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field_changed?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          question_id?: string
        }
        Relationships: []
      }
      question_edit_log: {
        Row: {
          action: string
          edited_at: string
          editor_id: string
          fields_changed: string[] | null
          id: string
          question_id: string
        }
        Insert: {
          action: string
          edited_at?: string
          editor_id: string
          fields_changed?: string[] | null
          id?: string
          question_id: string
        }
        Update: {
          action?: string
          edited_at?: string
          editor_id?: string
          fields_changed?: string[] | null
          id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_edit_log_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          a: string | null
          b: string | null
          c: string | null
          chapter: number | null
          correct: string | null
          correct_answer: string | null
          created_at: string | null
          d: string | null
          explanation: string | null
          id: string
          institution: string | null
          kind: string | null
          manually_edited: boolean | null
          media_kind: string | null
          media_link: string | null
          media_type: string | null
          miller: string | null
          miller_page: string | null
          option_a: string | null
          option_b: string | null
          option_c: string | null
          option_d: string | null
          question: string | null
          question_id: string | null
          question_text: string | null
          ref_id: string | null
          serial_number: number | null
          source: string | null
          topic: string | null
          topic_num: number | null
          updated_at: string | null
          year: string | null
        }
        Insert: {
          a?: string | null
          b?: string | null
          c?: string | null
          chapter?: number | null
          correct?: string | null
          correct_answer?: string | null
          created_at?: string | null
          d?: string | null
          explanation?: string | null
          id?: string
          institution?: string | null
          kind?: string | null
          manually_edited?: boolean | null
          media_kind?: string | null
          media_link?: string | null
          media_type?: string | null
          miller?: string | null
          miller_page?: string | null
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          question?: string | null
          question_id?: string | null
          question_text?: string | null
          ref_id?: string | null
          serial_number?: number | null
          source?: string | null
          topic?: string | null
          topic_num?: number | null
          updated_at?: string | null
          year?: string | null
        }
        Update: {
          a?: string | null
          b?: string | null
          c?: string | null
          chapter?: number | null
          correct?: string | null
          correct_answer?: string | null
          created_at?: string | null
          d?: string | null
          explanation?: string | null
          id?: string
          institution?: string | null
          kind?: string | null
          manually_edited?: boolean | null
          media_kind?: string | null
          media_link?: string | null
          media_type?: string | null
          miller?: string | null
          miller_page?: string | null
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          question?: string | null
          question_id?: string | null
          question_text?: string | null
          ref_id?: string | null
          serial_number?: number | null
          source?: string | null
          topic?: string | null
          topic_num?: number | null
          updated_at?: string | null
          year?: string | null
        }
        Relationships: []
      }
      resource_links: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          sort_order: number
          title: string
          url: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          url: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          url?: string
        }
        Relationships: []
      }
      saved_sessions: {
        Row: {
          created_at: string | null
          id: string
          session_data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          session_data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          session_data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      spaced_repetition: {
        Row: {
          confidence: string | null
          ease_factor: number
          id: string
          interval_days: number
          last_correct: boolean | null
          next_review_date: string
          question_id: string
          repetitions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string | null
          ease_factor?: number
          id?: string
          interval_days?: number
          last_correct?: boolean | null
          next_review_date?: string
          question_id: string
          repetitions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string | null
          ease_factor?: number
          id?: string
          interval_days?: number
          last_correct?: boolean | null
          next_review_date?: string
          question_id?: string
          repetitions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaced_repetition_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_summaries: {
        Row: {
          created_by: string | null
          drive_url: string | null
          embed_url: string
          id: string
          title: string
          topic_key: string
          updated_at: string
        }
        Insert: {
          created_by?: string | null
          drive_url?: string | null
          embed_url: string
          id?: string
          title: string
          topic_key: string
          updated_at?: string
        }
        Update: {
          created_by?: string | null
          drive_url?: string | null
          embed_url?: string
          id?: string
          title?: string
          topic_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_answers: {
        Row: {
          answered_at: string
          answered_count: number
          confidence: string | null
          correct_count: number
          ever_wrong: boolean
          id: string
          is_correct: boolean
          question_id: string
          topic: string | null
          topic_num: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          answered_at?: string
          answered_count?: number
          confidence?: string | null
          correct_count?: number
          ever_wrong?: boolean
          id?: string
          is_correct: boolean
          question_id: string
          topic?: string | null
          topic_num?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          answered_at?: string
          answered_count?: number
          confidence?: string | null
          correct_count?: number
          ever_wrong?: boolean
          id?: string
          is_correct?: boolean
          question_id?: string
          topic?: string | null
          topic_num?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_answers_topic_num_fkey"
            columns: ["topic_num"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["topic_num"]
          },
        ]
      }
      user_favorites: {
        Row: {
          created_at: string | null
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notes: {
        Row: {
          id: string
          note_text: string
          question_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          note_text?: string
          question_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          note_text?: string
          question_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ratings: {
        Row: {
          id: string
          question_id: string
          rating: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          question_id: string
          rating: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          question_id?: string
          rating?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ratings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tags: {
        Row: {
          created_at: string | null
          id: string
          question_id: string
          tag: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          question_id: string
          tag: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          question_id?: string
          tag?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_weekly_plans: {
        Row: {
          id: string
          plan_data: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          plan_data?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          plan_data?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_global_daily_accuracy: {
        Args: { since_date: string }
        Returns: {
          avg_accuracy: number
          day: string
        }[]
      }
      get_global_topic_stats: {
        Args: never
        Returns: {
          avg_accuracy: number
          topic: string
          total_users: number
        }[]
      }
      get_question_ids_by_confidence: {
        Args: { p_confidence_status: string; p_user_id: string }
        Returns: {
          question_id: string
        }[]
      }
      get_question_success_rate: {
        Args: { qid: string }
        Returns: {
          success_rate: number
          total_users: number
        }[]
      }
      increment_user_answer: {
        Args: {
          p_is_correct: boolean
          p_question_id: string
          p_topic?: string
          p_user_id: string
        }
        Returns: undefined
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_editor: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      idea_status: "captured" | "planning" | "ready" | "done"
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
    Enums: {
      idea_status: ["captured", "planning", "ready", "done"],
    },
  },
} as const
