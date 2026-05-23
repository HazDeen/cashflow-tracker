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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          code: string
          description: string
          icon: string
          id: string
          title: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          code: string
          description: string
          icon?: string
          id?: string
          title: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          code?: string
          description?: string
          icon?: string
          id?: string
          title?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      banks: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      cashback_payouts: {
        Row: {
          bank_name: string
          created_at: string
          details: Json | null
          id: string
          notified_at: string | null
          payout_on: string
          period_end: string
          period_start: string
          resolved_at: string | null
          status: string
          total_amount: number
          user_id: string
        }
        Insert: {
          bank_name: string
          created_at?: string
          details?: Json | null
          id?: string
          notified_at?: string | null
          payout_on: string
          period_end: string
          period_start: string
          resolved_at?: string | null
          status?: string
          total_amount?: number
          user_id: string
        }
        Update: {
          bank_name?: string
          created_at?: string
          details?: Json | null
          id?: string
          notified_at?: string | null
          payout_on?: string
          period_end?: string
          period_start?: string
          resolved_at?: string | null
          status?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: []
      }
      cashbacks: {
        Row: {
          bank_id: string | null
          bank_name: string
          card_name: string | null
          category: string
          created_at: string
          id: string
          is_active: boolean
          monthly_limit: number | null
          name: string
          notify_days_before: number
          payout_day: number | null
          percent: number
          user_id: string
        }
        Insert: {
          bank_id?: string | null
          bank_name?: string
          card_name?: string | null
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_limit?: number | null
          name: string
          notify_days_before?: number
          payout_day?: number | null
          percent?: number
          user_id: string
        }
        Update: {
          bank_id?: string | null
          bank_name?: string
          card_name?: string | null
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_limit?: number | null
          name?: string
          notify_days_before?: number
          payout_day?: number | null
          percent?: number
          user_id?: string
        }
        Relationships: []
      }
      credits: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          monthly_payment: number
          months_total: number
          name: string
          paid_amount: number
          payment_day: number
          start_date: string
          total_amount: number
          total_payable: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_payment: number
          months_total: number
          name: string
          paid_amount?: number
          payment_day: number
          start_date?: string
          total_amount: number
          total_payable: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_payment?: number
          months_total?: number
          name?: string
          paid_amount?: number
          payment_day?: number
          start_date?: string
          total_amount?: number
          total_payable?: number
          user_id?: string
        }
        Relationships: []
      }
      debts: {
        Row: {
          amount: number
          counterparty: string
          created_at: string
          direction: Database["public"]["Enums"]["debt_direction"]
          due_date: string | null
          id: string
          is_settled: boolean
          user_id: string
        }
        Insert: {
          amount: number
          counterparty: string
          created_at?: string
          direction: Database["public"]["Enums"]["debt_direction"]
          due_date?: string | null
          id?: string
          is_settled?: boolean
          user_id: string
        }
        Update: {
          amount?: number
          counterparty?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["debt_direction"]
          due_date?: string | null
          id?: string
          is_settled?: boolean
          user_id?: string
        }
        Relationships: []
      }
      extra_incomes: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          next_date: string
          period_unit: string
          period_value: number
          user_id: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          next_date: string
          period_unit?: string
          period_value?: number
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          next_date?: string
          period_unit?: string
          period_value?: number
          user_id?: string
        }
        Relationships: []
      }
      payment_confirmations: {
        Row: {
          asked_at: string
          due_on: string
          id: string
          kind: string
          ref_id: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          asked_at?: string
          due_on: string
          id?: string
          kind: string
          ref_id: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          asked_at?: string
          due_on?: string
          id?: string
          kind?: string
          ref_id?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          emergency_months: number
          greeting_emoji: string | null
          id: string
          telegram_chat_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          emergency_months?: number
          greeting_emoji?: string | null
          id: string
          telegram_chat_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          emergency_months?: number
          greeting_emoji?: string | null
          id?: string
          telegram_chat_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          id: string
          is_done: boolean
          note: string | null
          notified: boolean
          remind_on: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_done?: boolean
          note?: string | null
          notified?: boolean
          remind_on: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_done?: boolean
          note?: string | null
          notified?: boolean
          remind_on?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      salaries: {
        Row: {
          amount: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          payment_days: number[]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          payment_days?: number[]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          payment_days?: number[]
          user_id?: string
        }
        Relationships: []
      }
      savings_goals: {
        Row: {
          created_at: string
          current_amount: number
          deadline: string | null
          emoji: string
          id: string
          is_archived: boolean
          name: string
          target_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string
          current_amount?: number
          deadline?: string | null
          emoji?: string
          id?: string
          is_archived?: boolean
          name: string
          target_amount: number
          user_id: string
        }
        Update: {
          created_at?: string
          current_amount?: number
          deadline?: string | null
          emoji?: string
          id?: string
          is_archived?: boolean
          name?: string
          target_amount?: number
          user_id?: string
        }
        Relationships: []
      }
      shared_budget_members: {
        Row: {
          budget_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          budget_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          budget_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_budget_members_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "shared_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_budgets: {
        Row: {
          created_at: string
          emoji: string
          id: string
          invite_code: string
          monthly_limit: number | null
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          invite_code: string
          monthly_limit?: number | null
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          invite_code?: string
          monthly_limit?: number | null
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      shared_transactions: {
        Row: {
          added_by: string
          amount: number
          budget_id: string
          category: string
          comment: string | null
          created_at: string
          id: string
          occurred_on: string
          type: string
        }
        Insert: {
          added_by: string
          amount: number
          budget_id: string
          category?: string
          comment?: string | null
          created_at?: string
          id?: string
          occurred_on?: string
          type: string
        }
        Update: {
          added_by?: string
          amount?: number
          budget_id?: string
          category?: string
          comment?: string | null
          created_at?: string
          id?: string
          occurred_on?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_transactions_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "shared_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          charge_day: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          period_unit: string
          period_value: number
          user_id: string
        }
        Insert: {
          amount: number
          charge_day: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          period_unit?: string
          period_value?: number
          user_id: string
        }
        Update: {
          amount?: number
          charge_day?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          period_unit?: string
          period_value?: number
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          bank_id: string | null
          category: string
          comment: string | null
          created_at: string
          id: string
          occurred_on: string
          subscription_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Insert: {
          amount: number
          bank_id?: string | null
          category: string
          comment?: string | null
          created_at?: string
          id?: string
          occurred_on?: string
          subscription_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Update: {
          amount?: number
          bank_id?: string | null
          category?: string
          comment?: string | null
          created_at?: string
          id?: string
          occurred_on?: string
          subscription_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_shifts: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          paid: boolean
          shift_date: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          paid?: boolean
          shift_date: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          paid?: boolean
          shift_date?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_cashback_income: {
        Args: { _amount: number; _cashback_id: string }
        Returns: undefined
      }
      confirm_cashback_payout: {
        Args: { _amount: number; _payout_id: string }
        Returns: undefined
      }
      contribute_to_goal: {
        Args: { _amount: number; _goal_id: string }
        Returns: undefined
      }
      create_pending_cashback_payouts: {
        Args: never
        Returns: {
          bank_name: string
          chat_id: number
          payout_id: string
          payout_on: string
          total: number
          user_id: string
        }[]
      }
      create_pending_payment_confirmations: {
        Args: never
        Returns: {
          amount: number
          chat_id: number
          kind: string
          ref_id: string
          title: string
          user_id: string
        }[]
      }
      create_shared_budget: {
        Args: { _emoji?: string; _monthly_limit?: number; _name: string }
        Returns: string
      }
      evaluate_achievements: {
        Args: { p_user?: string }
        Returns: {
          code: string
          description: string
          icon: string
          id: string
          title: string
          unlocked_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "achievements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      extra_credit_payment: {
        Args: { _amount: number; _credit_id: string }
        Returns: undefined
      }
      get_balance_forecast: {
        Args: { _days?: number }
        Returns: {
          balance: number
          d: string
          delta: number
        }[]
      }
      get_calendar_events: {
        Args: { _from: string; _to: string }
        Returns: {
          amount: number
          d: string
          direction: string
          kind: string
          title: string
        }[]
      }
      get_cashback_bank_summary: {
        Args: { p_user: string }
        Returns: {
          bank_name: string
          details: Json
          payout_day: number
          total: number
        }[]
      }
      get_cashback_calc: {
        Args: never
        Returns: {
          accrued: number
          bank_id: string
          bank_name: string
          category: string
          id: string
          monthly_limit: number
          payout_day: number
          percent: number
          spent: number
        }[]
      }
      get_dashboard_stats: {
        Args: never
        Returns: {
          balance: number
          daily_limit: number
          expected_income: number
          my_debts: number
          pending_subs: number
          total_subs: number
          weekly_limit: number
        }[]
      }
      get_my_shared_budgets: {
        Args: never
        Returns: {
          balance: number
          emoji: string
          id: string
          invite_code: string
          members_count: number
          month_expense: number
          month_income: number
          monthly_limit: number
          name: string
          owner_id: string
        }[]
      }
      get_next_income: {
        Args: never
        Returns: {
          amount: number
          due_on: string
          kind: string
          title: string
        }[]
      }
      get_next_payment: {
        Args: never
        Returns: {
          amount: number
          due_on: string
          kind: string
          title: string
        }[]
      }
      get_user_gamification: { Args: { p_user?: string }; Returns: Json }
      get_user_streak: {
        Args: { p_user?: string }
        Returns: {
          current_streak: number
          longest_streak: number
          total_days: number
        }[]
      }
      is_budget_member: {
        Args: { _budget: string; _user: string }
        Returns: boolean
      }
      join_shared_budget: { Args: { _code: string }; Returns: string }
      process_subscription_charges: { Args: never; Returns: number }
      reject_cashback_payout: {
        Args: { _payout_id: string }
        Returns: undefined
      }
      resolve_payment_confirmation: {
        Args: { _confirmation_id: string; _confirmed: boolean }
        Returns: undefined
      }
    }
    Enums: {
      debt_direction: "i_owe" | "owed_to_me"
      transaction_type: "income" | "expense"
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
      debt_direction: ["i_owe", "owed_to_me"],
      transaction_type: ["income", "expense"],
    },
  },
} as const
