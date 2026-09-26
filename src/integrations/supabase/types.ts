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
      checkins: {
        Row: {
          created_at: string
          event_id: string
          id: string
          staff_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          staff_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          staff_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          city: string
          created_at: string
          description: string
          high_demand: boolean
          hold_minutes: number
          id: string
          is_demo_lab: boolean
          name: string
          per_user_limit: number
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          updated_at: string
          venue: string
        }
        Insert: {
          city?: string
          created_at?: string
          description?: string
          high_demand?: boolean
          hold_minutes?: number
          id?: string
          is_demo_lab?: boolean
          name: string
          per_user_limit?: number
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
          venue: string
        }
        Update: {
          city?: string
          created_at?: string
          description?: string
          high_demand?: boolean
          hold_minutes?: number
          id?: string
          is_demo_lab?: boolean
          name?: string
          per_user_limit?: number
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
          venue?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          response: Json
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          key: string
          response: Json
          scope: string
          user_id: string
        }
        Update: {
          created_at?: string
          key?: string
          response?: Json
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string
          event_id: string
          id: string
          reservation_id: string
          status: Database["public"]["Enums"]["order_status"]
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name: string
          event_id: string
          id?: string
          reservation_id: string
          status?: Database["public"]["Enums"]["order_status"]
          total_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string
          event_id?: string
          id?: string
          reservation_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          aggregate_id: string | null
          aggregate_type: string
          created_at: string
          event_type: string
          id: number
          payload: Json
          processed_at: string | null
        }
        Insert: {
          aggregate_id?: string | null
          aggregate_type: string
          created_at?: string
          event_type: string
          id?: never
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          aggregate_id?: string | null
          aggregate_type?: string
          created_at?: string
          event_type?: string
          id?: never
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          order_id: string
          provider_reference: string
          requested_outcome: string
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount_cents: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          order_id: string
          provider_reference: string
          requested_outcome: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount_cents?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          order_id?: string
          provider_reference?: string
          requested_outcome?: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          bucket_key: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          bucket_key: string
          created_at: string
          hits: number
          id: number
          limit_value: number
          scope: string
        }
        Insert: {
          bucket_key: string
          created_at?: string
          hits: number
          id?: never
          limit_value: number
          scope: string
        }
        Update: {
          bucket_key?: string
          created_at?: string
          hits?: number
          id?: never
          limit_value?: number
          scope?: string
        }
        Relationships: []
      }
      reservation_items: {
        Row: {
          id: string
          quantity: number
          reservation_id: string
          ticket_type_id: string
          unit_price_cents: number
        }
        Insert: {
          id?: string
          quantity: number
          reservation_id: string
          ticket_type_id: string
          unit_price_cents: number
        }
        Update: {
          id?: string
          quantity?: number
          reservation_id?: string
          ticket_type_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservation_items_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_items_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string
          event_id: string
          expires_at: string
          id: string
          idempotency_key: string
          release_reason: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          total_quantity: number
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          expires_at: string
          id?: string
          idempotency_key: string
          release_reason?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          total_quantity: number
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          release_reason?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          total_quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string
          event_id: string | null
          event_type: string
          id: number
          ip_hash: string | null
          metadata: Json
          severity: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          event_type: string
          id?: never
          ip_hash?: string | null
          metadata?: Json
          severity?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string | null
          event_type?: string
          id?: never
          ip_hash?: string | null
          metadata?: Json
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ticket_types: {
        Row: {
          available_quantity: number
          created_at: string
          description: string
          event_id: string
          held_quantity: number
          id: string
          name: string
          price_cents: number
          sold_quantity: number
          sort_order: number
          total_quantity: number
        }
        Insert: {
          available_quantity: number
          created_at?: string
          description?: string
          event_id: string
          held_quantity?: number
          id?: string
          name: string
          price_cents: number
          sold_quantity?: number
          sort_order?: number
          total_quantity: number
        }
        Update: {
          available_quantity?: number
          created_at?: string
          description?: string
          event_id?: string
          held_quantity?: number
          id?: string
          name?: string
          price_cents?: number
          sold_quantity?: number
          sort_order?: number
          total_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          code: string
          event_id: string
          id: string
          issued_at: string
          nonce: string
          order_id: string
          signature: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_type_id: string
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          code: string
          event_id: string
          id?: string
          issued_at?: string
          nonce: string
          order_id: string
          signature?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_type_id: string
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          code?: string
          event_id?: string
          id?: string
          issued_at?: string
          nonce?: string
          order_id?: string
          signature?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_type_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _release_reservation: {
        Args: {
          p_reason: string
          p_res: string
          p_status: Database["public"]["Enums"]["reservation_status"]
        }
        Returns: boolean
      }
      admin_stats: { Args: never; Returns: Json }
      admin_upsert_ticket_type: {
        Args: {
          p_description: string
          p_event: string
          p_id: string
          p_name: string
          p_price: number
          p_sort: number
          p_total: number
        }
        Returns: Json
      }
      check_in_ticket: {
        Args: { p_code: string; p_event: string; p_staff: string }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          p_key: string
          p_limit: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      complete_payment: {
        Args: {
          p_order: string
          p_outcome: string
          p_payment_key: string
          p_user: string
        }
        Returns: Json
      }
      demo_force_expire: { Args: { p_res: string }; Returns: Json }
      demo_reset_lab: {
        Args: { p_limit: number; p_quantity: number }
        Returns: Json
      }
      emit_outbox: {
        Args: { p_agg: string; p_id: string; p_payload: Json; p_type: string }
        Returns: undefined
      }
      ensure_profile: {
        Args: { p_email: string; p_user: string }
        Returns: Json
      }
      expire_stale_reservations: { Args: never; Returns: number }
      get_traffic_status: { Args: { p_event: string }; Returns: Json }
      grant_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      inspect_ticket: {
        Args: { p_code: string; p_event: string }
        Returns: Json
      }
      log_security: {
        Args: {
          p_event: string
          p_ip: string
          p_meta: Json
          p_severity: string
          p_type: string
          p_user: string
        }
        Returns: undefined
      }
      release_reservation: {
        Args: { p_res: string; p_user: string }
        Returns: Json
      }
      reserve_tickets: {
        Args: {
          p_event: string
          p_idempotency_key: string
          p_ip: string
          p_items: Json
          p_meta?: Json
          p_user: string
        }
        Returns: Json
      }
      set_ticket_signature: {
        Args: { p_signature: string; p_ticket: string }
        Returns: undefined
      }
      start_checkout: {
        Args: { p_email: string; p_name: string; p_res: string; p_user: string }
        Returns: Json
      }
      user_event_usage: {
        Args: { p_event: string; p_user: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "customer"
      event_status: "DRAFT" | "PUBLISHED" | "CANCELLED"
      order_status:
        | "CREATED"
        | "RESERVED"
        | "PAYMENT_PENDING"
        | "PAID"
        | "CONFIRMED"
        | "CANCELLED"
        | "EXPIRED"
        | "PAYMENT_FAILED"
      payment_status: "PENDING" | "SUCCEEDED" | "DECLINED" | "TIMEOUT"
      reservation_status: "HELD" | "CONVERTED" | "EXPIRED" | "RELEASED"
      ticket_status: "VALID" | "CHECKED_IN" | "CANCELLED" | "EXPIRED"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "staff", "customer"],
      event_status: ["DRAFT", "PUBLISHED", "CANCELLED"],
      order_status: [
        "CREATED",
        "RESERVED",
        "PAYMENT_PENDING",
        "PAID",
        "CONFIRMED",
        "CANCELLED",
        "EXPIRED",
        "PAYMENT_FAILED",
      ],
      payment_status: ["PENDING", "SUCCEEDED", "DECLINED", "TIMEOUT"],
      reservation_status: ["HELD", "CONVERTED", "EXPIRED", "RELEASED"],
      ticket_status: ["VALID", "CHECKED_IN", "CANCELLED", "EXPIRED"],
    },
  },
} as const
