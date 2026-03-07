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
      anki_cards: {
        Row: {
          back: string
          created_at: string
          deck_id: string
          due_date: string
          ease_factor: number
          front: string
          id: string
          interval_days: number
          repetitions: number
          user_id: string
        }
        Insert: {
          back: string
          created_at?: string
          deck_id: string
          due_date?: string
          ease_factor?: number
          front: string
          id?: string
          interval_days?: number
          repetitions?: number
          user_id: string
        }
        Update: {
          back?: string
          created_at?: string
          deck_id?: string
          due_date?: string
          ease_factor?: number
          front?: string
          id?: string
          interval_days?: number
          repetitions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anki_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "anki_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      anki_decks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      calculator_formulas: {
        Row: {
          category_id: string
          category_label: string
          created_at: string
          expression: string
          formula_name: string
          id: string
          inputs: Json
          note: string | null
          sort_order: number
          unit: string
        }
        Insert: {
          category_id: string
          category_label: string
          created_at?: string
          expression: string
          formula_name: string
          id: string
          inputs?: Json
          note?: string | null
          sort_order?: number
          unit: string
        }
        Update: {
          category_id?: string
          category_label?: string
          created_at?: string
          expression?: string
          formula_name?: string
          id?: string
          inputs?: Json
          note?: string | null
          sort_order?: number
          unit?: string
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
          author_display: string
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
          created_at: string
          equation: string
          formula_name: string
          id: string
          unit: string
          variables: string
        }
        Insert: {
          category: string
          chapter: string
          clinical_note?: string
          created_at?: string
          equation: string
          formula_name: string
          id: string
          unit: string
          variables: string
        }
        Update: {
          category?: string
          chapter?: string
          clinical_note?: string
          created_at?: string
          equation?: string
          formula_name?: string
          id?: string
          unit?: string
          variables?: string
        }
        Relationships: []
      }
      question_audit_log: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          field_changed: string | null
          id: string
          new_value: string | null
          old_value: string | null
          question_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          question_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_audit_log_question_id_fkey"
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
          correct: string
          d: string | null
          explanation: string | null
          id: string
          kind: string | null
          manually_edited: boolean
          media_link: string | null
          media_type: string | null
          miller: string | null
          question: string
          ref_id: string | null
          source: string | null
          synced_at: string
          topic: string | null
          year: string | null
        }
        Insert: {
          a?: string | null
          b?: string | null
          c?: string | null
          chapter?: number | null
          correct: string
          d?: string | null
          explanation?: string | null
          id: string
          kind?: string | null
          manually_edited?: boolean
          media_link?: string | null
          media_type?: string | null
          miller?: string | null
          question: string
          ref_id?: string | null
          source?: string | null
          synced_at?: string
          topic?: string | null
          year?: string | null
        }
        Update: {
          a?: string | null
          b?: string | null
          c?: string | null
          chapter?: number | null
          correct?: string
          d?: string | null
          explanation?: string | null
          id?: string
          kind?: string | null
          manually_edited?: boolean
          media_link?: string | null
          media_type?: string | null
          miller?: string | null
          question?: string
          ref_id?: string | null
          source?: string | null
          synced_at?: string
          topic?: string | null
          year?: string | null
        }
        Relationships: []
      }
      room_answers: {
        Row: {
          answered_at: string
          id: string
          is_correct: boolean
          question_index: number
          room_id: string
          selected_answer: string
          user_id: string
        }
        Insert: {
          answered_at?: string
          id?: string
          is_correct: boolean
          question_index: number
          room_id: string
          selected_answer: string
          user_id: string
        }
        Update: {
          answered_at?: string
          id?: string
          is_correct?: boolean
          question_index?: number
          room_id?: string
          selected_answer?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_answers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_participants: {
        Row: {
          display_name: string
          id: string
          is_ready: boolean
          joined_at: string
          last_active_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          display_name: string
          id?: string
          is_ready?: boolean
          joined_at?: string
          last_active_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          display_name?: string
          id?: string
          is_ready?: boolean
          joined_at?: string
          last_active_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "study_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_sessions: {
        Row: {
          created_at: string
          id: string
          session_data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
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
          id: string
          last_correct: boolean | null
          next_review_date: string
          question_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string | null
          id?: string
          last_correct?: boolean | null
          next_review_date?: string
          question_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string | null
          id?: string
          last_correct?: boolean | null
          next_review_date?: string
          question_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_rooms: {
        Row: {
          created_at: string
          created_by: string
          current_question_index: number
          expires_at: string
          id: string
          question_ids: string[]
          room_code: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_question_index?: number
          expires_at?: string
          id?: string
          question_ids: string[]
          room_code: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_question_index?: number
          expires_at?: string
          id?: string
          question_ids?: string[]
          room_code?: string
          status?: string
        }
        Relationships: []
      }
      user_answers: {
        Row: {
          answered_count: number
          correct_count: number
          ever_wrong: boolean
          id: string
          is_correct: boolean
          question_id: string
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answered_count?: number
          correct_count?: number
          ever_wrong?: boolean
          id?: string
          is_correct: boolean
          question_id: string
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answered_count?: number
          correct_count?: number
          ever_wrong?: boolean
          id?: string
          is_correct?: boolean
          question_id?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          created_at: string
          feedback_text: string
          id: string
          page_context: string | null
          question_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_text: string
          id?: string
          page_context?: string | null
          question_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_text?: string
          id?: string
          page_context?: string | null
          question_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_notes: {
        Row: {
          id: string
          note_text: string
          question_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          note_text: string
          question_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          note_text?: string
          question_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ratings: {
        Row: {
          id: string
          question_id: string
          rating: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          question_id: string
          rating: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          question_id?: string
          rating?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_tags: {
        Row: {
          created_at: string
          id: string
          question_id: string
          tag: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          tag: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          tag?: string
          user_id?: string
        }
        Relationships: []
      }
      user_weekly_plans: {
        Row: {
          id: string
          plan_data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          plan_data: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          plan_data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_global_topic_stats: {
        Args: never
        Returns: {
          avg_accuracy: number
          topic: string
          total_users: number
        }[]
      }
      get_question_success_rate: {
        Args: { qid: string }
        Returns: {
          correct_users: number
          success_rate: number
          total_users: number
        }[]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_room_participant: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
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
