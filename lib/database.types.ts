export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      actions: {
        Row: {
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          session_id: string
          status: string
          we_did: string
          you_said: string
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          session_id: string
          status: string
          we_did: string
          you_said: string
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          session_id?: string
          status?: string
          we_did?: string
          you_said?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent: string
          agent_version: string
          cost_usd: number
          created_at: string
          error: string | null
          id: string
          input_tokens: number
          interview_id: string | null
          latency_ms: number
          learner_id: string | null
          model: string
          operation: string
          organization_id: string
          outcome: string
          output_tokens: number
          question_id: string | null
          session_id: string | null
        }
        Insert: {
          agent: string
          agent_version: string
          cost_usd?: number
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number
          interview_id?: string | null
          latency_ms?: number
          learner_id?: string | null
          model: string
          operation: string
          organization_id: string
          outcome: string
          output_tokens?: number
          question_id?: string | null
          session_id?: string | null
        }
        Update: {
          agent?: string
          agent_version?: string
          cost_usd?: number
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number
          interview_id?: string | null
          latency_ms?: number
          learner_id?: string | null
          model?: string
          operation?: string
          organization_id?: string
          outcome?: string
          output_tokens?: number
          question_id?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          agent_version: string | null
          author_id: string | null
          citations: Json
          course_id: string
          created_at: string
          edited: boolean
          id: string
          kind: string
          organization_id: string
          question_id: string
          session_id: string
          sources_disagree: boolean
          text: string
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          agent_version?: string | null
          author_id?: string | null
          citations?: Json
          course_id: string
          created_at?: string
          edited?: boolean
          id?: string
          kind: string
          organization_id: string
          question_id: string
          session_id: string
          sources_disagree?: boolean
          text: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          agent_version?: string | null
          author_id?: string | null
          citations?: Json
          course_id?: string
          created_at?: string
          edited?: boolean
          id?: string
          kind?: string
          organization_id?: string
          question_id?: string
          session_id?: string
          sources_disagree?: boolean
          text?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      completions: {
        Row: {
          completed_on: string
          course_id: string
          id: string
          kind: Database["public"]["Enums"]["interview_kind"]
          organization_id: string
          session_id: string
          user_id: string
        }
        Insert: {
          completed_on?: string
          course_id: string
          id?: string
          kind: Database["public"]["Enums"]["interview_kind"]
          organization_id: string
          session_id: string
          user_id: string
        }
        Update: {
          completed_on?: string
          course_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["interview_kind"]
          organization_id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          description: string
          feedback_window_days: number
          follow_up_days: number
          id: string
          max_minutes: number
          max_turns: number
          min_group_size: number
          organization_id: string
          retention_days: number
          slug: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          feedback_window_days?: number
          follow_up_days?: number
          id?: string
          max_minutes?: number
          max_turns?: number
          min_group_size?: number
          organization_id: string
          retention_days?: number
          slug: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          feedback_window_days?: number
          follow_up_days?: number
          id?: string
          max_minutes?: number
          max_turns?: number
          min_group_size?: number
          organization_id?: string
          retention_days?: number
          slug?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          answer_id: string | null
          chunk_index: number
          content: string
          course_id: string | null
          created_at: string
          document_id: string | null
          documentation_source_id: string | null
          embedding: string
          id: string
          organization_id: string
          page_hash: string | null
          page_url: string | null
          session_id: string | null
          source_kind: Database["public"]["Enums"]["chunk_source_kind"]
          title: string
        }
        Insert: {
          answer_id?: string | null
          chunk_index?: number
          content: string
          course_id?: string | null
          created_at?: string
          document_id?: string | null
          documentation_source_id?: string | null
          embedding: string
          id?: string
          organization_id: string
          page_hash?: string | null
          page_url?: string | null
          session_id?: string | null
          source_kind: Database["public"]["Enums"]["chunk_source_kind"]
          title: string
        }
        Update: {
          answer_id?: string | null
          chunk_index?: number
          content?: string
          course_id?: string | null
          created_at?: string
          document_id?: string | null
          documentation_source_id?: string | null
          embedding?: string
          id?: string
          organization_id?: string
          page_hash?: string | null
          page_url?: string | null
          session_id?: string | null
          source_kind?: Database["public"]["Enums"]["chunk_source_kind"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_documentation_source_id_fkey"
            columns: ["documentation_source_id"]
            isOneToOne: false
            referencedRelation: "documentation_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      documentation_sources: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          last_read_at: string | null
          next_read_at: string | null
          organization_id: string
          page_count: number
          status: Database["public"]["Enums"]["processing_status"]
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          last_read_at?: string | null
          next_read_at?: string | null
          organization_id: string
          page_count?: number
          status?: Database["public"]["Enums"]["processing_status"]
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          last_read_at?: string | null
          next_read_at?: string | null
          organization_id?: string
          page_count?: number
          status?: Database["public"]["Enums"]["processing_status"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentation_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          audience: Database["public"]["Enums"]["document_audience"]
          chunk_count: number
          course_id: string
          created_at: string
          created_by: string | null
          error: string | null
          file_name: string
          id: string
          mime_type: string
          organization_id: string
          session_id: string
          size_bytes: number
          status: Database["public"]["Enums"]["processing_status"]
          storage_path: string
          title: string
          updated_at: string
        }
        Insert: {
          audience: Database["public"]["Enums"]["document_audience"]
          chunk_count?: number
          course_id: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          file_name: string
          id?: string
          mime_type: string
          organization_id: string
          session_id: string
          size_bytes: number
          status?: Database["public"]["Enums"]["processing_status"]
          storage_path: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["document_audience"]
          chunk_count?: number
          course_id?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          organization_id?: string
          session_id?: string
          size_bytes?: number
          status?: Database["public"]["Enums"]["processing_status"]
          storage_path?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          course_id: string
          created_at: string
          display_name: string
          email: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          display_name: string
          email: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          course_id: string
          created_at: string
          follow_up: Json
          id: string
          organization_id: string
          rating_items: Json
          topics: Json
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          course_id: string
          created_at?: string
          follow_up: Json
          id?: string
          organization_id: string
          rating_items: Json
          topics: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          course_id?: string
          created_at?: string
          follow_up?: Json
          id?: string
          organization_id?: string
          rating_items?: Json
          topics?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "guides_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          accuracy: string | null
          accuracy_marked_at: string | null
          accuracy_marked_by: string | null
          agent_version: string
          blockers: Json
          course_id: string
          created_at: string
          id: string
          interview_id: string
          kind: Database["public"]["Enums"]["interview_kind"]
          organization_id: string
          paraphrases: Json
          quotes: Json
          session_id: string
          suggestions: Json
          themes: Json
        }
        Insert: {
          accuracy?: string | null
          accuracy_marked_at?: string | null
          accuracy_marked_by?: string | null
          agent_version: string
          blockers?: Json
          course_id: string
          created_at?: string
          id?: string
          interview_id: string
          kind: Database["public"]["Enums"]["interview_kind"]
          organization_id: string
          paraphrases?: Json
          quotes?: Json
          session_id: string
          suggestions?: Json
          themes: Json
        }
        Update: {
          accuracy?: string | null
          accuracy_marked_at?: string | null
          accuracy_marked_by?: string | null
          agent_version?: string
          blockers?: Json
          course_id?: string
          created_at?: string
          id?: string
          interview_id?: string
          kind?: Database["public"]["Enums"]["interview_kind"]
          organization_id?: string
          paraphrases?: Json
          quotes?: Json
          session_id?: string
          suggestions?: Json
          themes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "insights_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: true
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_turns: {
        Row: {
          created_at: string
          id: string
          interview_id: string
          mode: string
          organization_id: string
          role: string
          seq: number
          stage: Database["public"]["Enums"]["interview_stage"]
          text: string
          topic: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          interview_id: string
          mode: string
          organization_id: string
          role: string
          seq: number
          stage: Database["public"]["Enums"]["interview_stage"]
          text: string
          topic?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          interview_id?: string
          mode?: string
          organization_id?: string
          role?: string
          seq?: number
          stage?: Database["public"]["Enums"]["interview_stage"]
          text?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_turns_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_turns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          agent_version: string | null
          analysed_at: string | null
          analysis_attempts: number
          anonymity: Database["public"]["Enums"]["anonymity_level"]
          course_id: string
          id: string
          interview_rating: string | null
          kind: Database["public"]["Enums"]["interview_kind"]
          last_activity_at: string
          organization_id: string
          participant_id: string | null
          progress: Json
          session_id: string
          stage: Database["public"]["Enums"]["interview_stage"]
          started_at: string
          state: Database["public"]["Enums"]["interview_state"]
          submitted_at: string | null
          summary: Json | null
          summary_edited: boolean | null
          token_hash: string
          turn_count: number
        }
        Insert: {
          agent_version?: string | null
          analysed_at?: string | null
          analysis_attempts?: number
          anonymity?: Database["public"]["Enums"]["anonymity_level"]
          course_id: string
          id?: string
          interview_rating?: string | null
          kind?: Database["public"]["Enums"]["interview_kind"]
          last_activity_at?: string
          organization_id: string
          participant_id?: string | null
          progress?: Json
          session_id: string
          stage?: Database["public"]["Enums"]["interview_stage"]
          started_at?: string
          state?: Database["public"]["Enums"]["interview_state"]
          submitted_at?: string | null
          summary?: Json | null
          summary_edited?: boolean | null
          token_hash: string
          turn_count?: number
        }
        Update: {
          agent_version?: string | null
          analysed_at?: string | null
          analysis_attempts?: number
          anonymity?: Database["public"]["Enums"]["anonymity_level"]
          course_id?: string
          id?: string
          interview_rating?: string | null
          kind?: Database["public"]["Enums"]["interview_kind"]
          last_activity_at?: string
          organization_id?: string
          participant_id?: string | null
          progress?: Json
          session_id?: string
          stage?: Database["public"]["Enums"]["interview_stage"]
          started_at?: string
          state?: Database["public"]["Enums"]["interview_state"]
          submitted_at?: string | null
          summary?: Json | null
          summary_edited?: boolean | null
          token_hash?: string
          turn_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "interviews_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          last_error: string | null
          organization_id: string | null
          payload: Json
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          last_error?: string | null
          organization_id?: string | null
          payload?: Json
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          organization_id?: string | null
          payload?: Json
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          course_id: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          display_name: string
          email: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          live_theme_id: string | null
          logo_path: string | null
          name: string
          organization_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          live_theme_id?: string | null
          logo_path?: string | null
          name: string
          organization_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          live_theme_id?: string | null
          logo_path?: string | null
          name?: string
          organization_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_live_theme_fk"
            columns: ["live_theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_checks: {
        Row: {
          agent: string
          agent_version: string
          code_only: boolean
          created_at: string
          id: string
          interview_id: string | null
          items: Json
          kind: string
          organization_id: string
          passed: number
          session_id: string | null
          total: number
        }
        Insert: {
          agent: string
          agent_version: string
          code_only?: boolean
          created_at?: string
          id?: string
          interview_id?: string | null
          items: Json
          kind: string
          organization_id: string
          passed: number
          session_id?: string | null
          total: number
        }
        Update: {
          agent?: string
          agent_version?: string
          code_only?: boolean
          created_at?: string
          id?: string
          interview_id?: string | null
          items?: Json
          kind?: string
          organization_id?: string
          passed?: number
          session_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "quality_checks_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_checks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_votes: {
        Row: {
          course_id: string
          created_at: string
          id: string
          organization_id: string
          question_id: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          organization_id: string
          question_id: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_votes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_votes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_votes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          author_id: string | null
          author_name: string | null
          course_id: string
          created_at: string
          first_answered_at: string | null
          id: string
          organization_id: string
          origin: string
          sent_to_instructor_at: string | null
          session_id: string
          state: Database["public"]["Enums"]["question_state"]
          text: string
          vote_count: number
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          course_id: string
          created_at?: string
          first_answered_at?: string | null
          id?: string
          organization_id: string
          origin?: string
          sent_to_instructor_at?: string | null
          session_id: string
          state?: Database["public"]["Enums"]["question_state"]
          text: string
          vote_count?: number
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          course_id?: string
          created_at?: string
          first_answered_at?: string | null
          id?: string
          organization_id?: string
          origin?: string
          sent_to_instructor_at?: string | null
          session_id?: string
          state?: Database["public"]["Enums"]["question_state"]
          text?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "questions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          choice: string
          course_id: string
          created_at: string
          id: string
          interview_id: string
          item_id: string
          kind: Database["public"]["Enums"]["interview_kind"]
          organization_id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          choice: string
          course_id: string
          created_at?: string
          id?: string
          interview_id: string
          item_id: string
          kind: Database["public"]["Enums"]["interview_kind"]
          organization_id: string
          session_id: string
          updated_at?: string
        }
        Update: {
          choice?: string
          course_id?: string
          created_at?: string
          id?: string
          interview_id?: string
          item_id?: string
          kind?: Database["public"]["Enums"]["interview_kind"]
          organization_id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          brief: Json | null
          brief_approved_at: string | null
          brief_approved_by: string | null
          brief_draft: Json | null
          brief_draft_at: string | null
          closed_at: string | null
          closes_at: string | null
          course_id: string
          created_at: string
          date: string
          id: string
          number: number
          objectives: string
          opened_at: string | null
          organization_id: string
          state: Database["public"]["Enums"]["session_state"]
          summary: string | null
          summary_at: string | null
          summary_source: string | null
          title: string
        }
        Insert: {
          brief?: Json | null
          brief_approved_at?: string | null
          brief_approved_by?: string | null
          brief_draft?: Json | null
          brief_draft_at?: string | null
          closed_at?: string | null
          closes_at?: string | null
          course_id: string
          created_at?: string
          date: string
          id?: string
          number: number
          objectives?: string
          opened_at?: string | null
          organization_id: string
          state?: Database["public"]["Enums"]["session_state"]
          summary?: string | null
          summary_at?: string | null
          summary_source?: string | null
          title: string
        }
        Update: {
          brief?: Json | null
          brief_approved_at?: string | null
          brief_approved_by?: string | null
          brief_draft?: Json | null
          brief_draft_at?: string | null
          closed_at?: string | null
          closes_at?: string | null
          course_id?: string
          created_at?: string
          date?: string
          id?: string
          number?: number
          objectives?: string
          opened_at?: string | null
          organization_id?: string
          state?: Database["public"]["Enums"]["session_state"]
          summary?: string | null
          summary_at?: string | null
          summary_source?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          adjustments: Json
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          logo_path: string | null
          organization_id: string
          source: string
          status: Database["public"]["Enums"]["theme_status"]
          tokens: Json
        }
        Insert: {
          adjustments?: Json
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          logo_path?: string | null
          organization_id: string
          source: string
          status?: Database["public"]["Enums"]["theme_status"]
          tokens: Json
        }
        Update: {
          adjustments?: Json
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          logo_path?: string | null
          organization_id?: string
          source?: string
          status?: Database["public"]["Enums"]["theme_status"]
          tokens?: Json
        }
        Relationships: [
          {
            foreignKeyName: "themes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_course: { Args: { course: string }; Returns: boolean }
      can_read_interview: { Args: { p_interview: string }; Returns: boolean }
      can_read_results: { Args: { course: string }; Returns: boolean }
      can_see_course: { Args: { course: string }; Returns: boolean }
      claim_jobs: {
        Args: { p_limit: number; p_now: string }
        Returns: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          last_error: string | null
          organization_id: string | null
          payload: Json
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      course_org: { Args: { course: string }; Returns: string }
      delete_my_data: { Args: { p_course: string }; Returns: Json }
      get_branding: { Args: { p_slug: string }; Returns: Json }
      has_course_role: {
        Args: {
          course: string
          wanted: Database["public"]["Enums"]["staff_role"]
        }
        Returns: boolean
      }
      is_enrolled: { Args: { course: string }; Returns: boolean }
      is_org_admin: { Args: { org: string }; Returns: boolean }
      is_org_member: { Args: { org: string }; Returns: boolean }
      is_org_staff: { Args: { org: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      match_chunks: {
        Args: { p_count: number; p_course_id: string; p_embedding: string }
        Returns: {
          answer_id: string
          content: string
          document_id: string
          id: string
          page_url: string
          session_id: string
          similarity: number
          source_kind: Database["public"]["Enums"]["chunk_source_kind"]
          title: string
        }[]
      }
      platform_admin_emails: { Args: never; Returns: string[] }
      quality_figures: { Args: never; Returns: Json }
      session_response_counts: {
        Args: { p_course: string }
        Returns: {
          enrolled: number
          responses: number
          session_id: string
        }[]
      }
      session_results: {
        Args: {
          p_kind: Database["public"]["Enums"]["interview_kind"]
          p_session: string
        }
        Returns: Json
      }
      seven_day_quality: { Args: { p_now: string }; Returns: Json }
      submitted_count: {
        Args: {
          p_kind: Database["public"]["Enums"]["interview_kind"]
          p_session: string
        }
        Returns: number
      }
      user_id_by_email: { Args: { p_email: string }; Returns: string }
    }
    Enums: {
      anonymity_level: "named" | "anonymous" | "private"
      chunk_source_kind:
        | "session_document"
        | "documentation_page"
        | "verified_answer"
      document_audience: "learners" | "agents_only"
      interview_kind: "session" | "follow_up"
      interview_stage:
        | "consent"
        | "ratings"
        | "conversation"
        | "read_back"
        | "done"
      interview_state:
        | "in_progress"
        | "submitted"
        | "analysed"
        | "needs_review"
        | "abandoned"
      job_status: "queued" | "running" | "done" | "failed"
      processing_status: "processing" | "ready" | "failed"
      question_state: "open" | "ai_answered" | "needs_instructor" | "answered"
      session_state: "draft" | "scheduled" | "open" | "closed"
      staff_role: "org_admin" | "instructor" | "sponsor"
      theme_status: "proposed" | "live" | "archived"
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
      anonymity_level: ["named", "anonymous", "private"],
      chunk_source_kind: [
        "session_document",
        "documentation_page",
        "verified_answer",
      ],
      document_audience: ["learners", "agents_only"],
      interview_kind: ["session", "follow_up"],
      interview_stage: [
        "consent",
        "ratings",
        "conversation",
        "read_back",
        "done",
      ],
      interview_state: [
        "in_progress",
        "submitted",
        "analysed",
        "needs_review",
        "abandoned",
      ],
      job_status: ["queued", "running", "done", "failed"],
      processing_status: ["processing", "ready", "failed"],
      question_state: ["open", "ai_answered", "needs_instructor", "answered"],
      session_state: ["draft", "scheduled", "open", "closed"],
      staff_role: ["org_admin", "instructor", "sponsor"],
      theme_status: ["proposed", "live", "archived"],
    },
  },
} as const

