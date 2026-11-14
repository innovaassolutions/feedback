-- Course Feedback Platform: schema, Row Level Security and storage.
--
-- Rules that hold here, not in application code:
-- * Every table has Row Level Security on from the statement that creates it.
-- * Every row carries organization_id.
-- * Anonymous and private interviews have no participant_id. Completions live in their own
--   table with a date and no time, and no column or key links completions to interviews.
-- * Instructors read transcripts only for named interviews, and for anonymous ones once the
--   session has min_group_size submitted interviews. Private interviews are never readable.
-- * Timestamps on interviews, turns, ratings and insights are not granted to signed-in users,
--   so "no name or time" holds even for someone querying the API directly.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.session_state as enum ('draft', 'scheduled', 'open', 'closed');
create type public.interview_state as enum ('in_progress', 'submitted', 'analysed', 'needs_review', 'abandoned');
create type public.interview_stage as enum ('consent', 'ratings', 'conversation', 'read_back', 'done');
create type public.interview_kind as enum ('session', 'follow_up');
create type public.anonymity_level as enum ('named', 'anonymous', 'private');
create type public.question_state as enum ('open', 'ai_answered', 'needs_instructor', 'answered');
create type public.staff_role as enum ('org_admin', 'instructor', 'sponsor');
create type public.document_audience as enum ('learners', 'agents_only');
create type public.processing_status as enum ('processing', 'ready', 'failed');
create type public.chunk_source_kind as enum ('session_document', 'documentation_page', 'verified_answer');
create type public.theme_status as enum ('proposed', 'live', 'archived');
create type public.job_status as enum ('queued', 'running', 'done', 'failed');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  -- Every row carries organization_id. For an organization it is its own id.
  organization_id uuid generated always as (id) stored,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name text not null check (length(name) between 1 and 120),
  logo_path text,
  live_theme_id uuid,
  created_at timestamptz not null default now()
);
alter table public.organizations enable row level security;

create table public.themes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status public.theme_status not null default 'proposed',
  tokens jsonb not null,
  logo_path text,
  source text not null check (source in ('seed', 'brand_designer', 'restored', 'manual')),
  adjustments jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.themes enable row level security;
create index themes_org_idx on public.themes (organization_id, created_at desc);

alter table public.organizations
  add constraint organizations_live_theme_fk foreign key (live_theme_id) references public.themes (id) on delete set null;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  title text not null,
  description text not null default '',
  min_group_size int not null default 5 check (min_group_size between 1 and 100),
  max_turns int not null default 14 check (max_turns between 4 and 60),
  max_minutes int not null default 15 check (max_minutes between 2 and 120),
  follow_up_days int not null default 30 check (follow_up_days between 1 and 365),
  retention_days int not null default 365 check (retention_days between 1 and 3650),
  feedback_window_days int not null default 7 check (feedback_window_days between 1 and 90),
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);
alter table public.courses enable row level security;

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.staff_role not null,
  -- org_admin is organization-wide. Instructors and sponsors belong to one course.
  course_id uuid references public.courses (id) on delete cascade,
  display_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  check ((role = 'org_admin') = (course_id is null)),
  unique nulls not distinct (organization_id, user_id, role, course_id)
);
alter table public.memberships enable row level security;
create index memberships_user_idx on public.memberships (user_id);
create index memberships_course_idx on public.memberships (course_id);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (course_id, user_id)
);
alter table public.enrollments enable row level security;
create index enrollments_user_idx on public.enrollments (user_id);

-- ---------------------------------------------------------------------------
-- Sessions and their materials
-- ---------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  number int not null check (number > 0),
  title text not null,
  date date not null,
  objectives text not null default '',
  state public.session_state not null default 'draft',
  -- The Librarian's draft brief, and the brief an instructor approved for the Interviewer.
  brief_draft jsonb,
  brief_draft_at timestamptz,
  brief jsonb,
  brief_approved_at timestamptz,
  brief_approved_by uuid references auth.users (id) on delete set null,
  opened_at timestamptz,
  closes_at timestamptz,
  closed_at timestamptz,
  summary text,
  summary_source text check (summary_source in ('analyst', 'template')),
  summary_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, number)
);
alter table public.sessions enable row level security;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  title text not null,
  audience public.document_audience not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status public.processing_status not null default 'processing',
  error text,
  chunk_count int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.documents enable row level security;
create index documents_session_idx on public.documents (session_id);

create table public.documentation_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  url text not null,
  status public.processing_status not null default 'processing',
  page_count int not null default 0,
  error text,
  last_read_at timestamptz,
  next_read_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, url)
);
alter table public.documentation_sources enable row level security;

create table public.guides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null unique references public.courses (id) on delete cascade,
  version int not null default 1,
  rating_items jsonb not null,
  topics jsonb not null,
  follow_up jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.guides enable row level security;

-- ---------------------------------------------------------------------------
-- Interviews
-- ---------------------------------------------------------------------------

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  kind public.interview_kind not null default 'session',
  anonymity public.anonymity_level not null default 'anonymous',
  -- Only named interviews are linked to a learner.
  participant_id uuid references auth.users (id) on delete cascade,
  state public.interview_state not null default 'in_progress',
  stage public.interview_stage not null default 'consent',
  token_hash text not null,
  progress jsonb not null default '{}'::jsonb,
  turn_count int not null default 0,
  summary jsonb,
  summary_edited boolean,
  interview_rating text check (interview_rating in ('helpful', 'okay', 'not_helpful')),
  agent_version text,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  submitted_at timestamptz,
  analysed_at timestamptz,
  analysis_attempts int not null default 0,
  check (anonymity = 'named' or participant_id is null)
);
alter table public.interviews enable row level security;
create index interviews_session_idx on public.interviews (session_id, kind, state);
create index interviews_participant_idx on public.interviews (participant_id) where participant_id is not null;

create table public.interview_turns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  interview_id uuid not null references public.interviews (id) on delete cascade,
  seq int not null,
  role text not null check (role in ('learner', 'interviewer')),
  text text not null,
  mode text not null check (mode in ('text', 'voice', 'chip')),
  stage public.interview_stage not null,
  topic text,
  created_at timestamptz not null default now(),
  unique (interview_id, seq)
);
alter table public.interview_turns enable row level security;

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  interview_id uuid not null references public.interviews (id) on delete cascade,
  kind public.interview_kind not null,
  item_id text not null,
  choice text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (interview_id, item_id)
);
alter table public.ratings enable row level security;
create index ratings_session_idx on public.ratings (session_id, kind);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  interview_id uuid not null unique references public.interviews (id) on delete cascade,
  kind public.interview_kind not null,
  themes jsonb not null,
  blockers jsonb not null default '[]'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  quotes jsonb not null default '[]'::jsonb,
  paraphrases jsonb not null default '[]'::jsonb,
  agent_version text not null,
  accuracy text check (accuracy in ('accurate', 'not_accurate')),
  accuracy_marked_by uuid references auth.users (id) on delete set null,
  accuracy_marked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.insights enable row level security;
create index insights_session_idx on public.insights (session_id, kind);

-- Completion is recorded apart from the interview: a date and no time, and nothing that
-- points at an interview. This is what stops an anonymous interview being matched to a learner.
create table public.completions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.interview_kind not null,
  completed_on date not null default current_date,
  unique (session_id, user_id, kind)
);
alter table public.completions enable row level security;

-- ---------------------------------------------------------------------------
-- Q&A
-- ---------------------------------------------------------------------------

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  -- Anonymous questions store no author.
  author_id uuid references auth.users (id) on delete cascade,
  author_name text,
  text text not null check (length(text) between 3 and 2000),
  state public.question_state not null default 'open',
  origin text not null default 'board' check (origin in ('board', 'interview')),
  vote_count int not null default 0,
  sent_to_instructor_at timestamptz,
  first_answered_at timestamptz,
  created_at timestamptz not null default now(),
  check (author_id is not null or author_name is null)
);
alter table public.questions enable row level security;
create index questions_session_idx on public.questions (session_id, vote_count desc, created_at);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  kind text not null check (kind in ('ai', 'instructor')),
  text text not null,
  citations jsonb not null default '[]'::jsonb,
  sources_disagree boolean not null default false,
  verified boolean not null default false,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  edited boolean not null default false,
  author_id uuid references auth.users (id) on delete set null,
  agent_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.answers enable row level security;
create index answers_question_idx on public.answers (question_id);

create table public.question_votes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (question_id, user_id)
);
alter table public.question_votes enable row level security;

-- Chunks are created after answers so a verified answer can be a source.
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Null for documentation pages, which belong to the organization and serve all its courses.
  course_id uuid references public.courses (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete cascade,
  source_kind public.chunk_source_kind not null,
  document_id uuid references public.documents (id) on delete cascade,
  documentation_source_id uuid references public.documentation_sources (id) on delete cascade,
  answer_id uuid references public.answers (id) on delete cascade,
  page_url text,
  page_hash text,
  title text not null,
  content text not null,
  chunk_index int not null default 0,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  check (
    (source_kind = 'session_document' and document_id is not null and course_id is not null)
    or (source_kind = 'documentation_page' and documentation_source_id is not null and page_url is not null and course_id is null)
    or (source_kind = 'verified_answer' and answer_id is not null and course_id is not null)
  )
);
alter table public.document_chunks enable row level security;
create index document_chunks_course_idx on public.document_chunks (course_id);
create index document_chunks_org_kind_idx on public.document_chunks (organization_id, source_kind);
create index document_chunks_embedding_idx on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  you_said text not null,
  we_did text not null,
  status text not null check (status in ('planned', 'in_progress', 'done')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.actions enable row level security;

-- ---------------------------------------------------------------------------
-- Agent quality and background work
-- ---------------------------------------------------------------------------

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent text not null check (agent in ('interviewer', 'analyst', 'librarian', 'brand_designer', 'judge')),
  agent_version text not null,
  model text not null,
  operation text not null,
  interview_id uuid references public.interviews (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  question_id uuid references public.questions (id) on delete set null,
  -- Set only for named interviews and named questions.
  learner_id uuid references auth.users (id) on delete set null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms int not null default 0,
  outcome text not null check (outcome in ('ok', 'validation_failed', 'error')),
  error text,
  created_at timestamptz not null default now()
);
alter table public.agent_runs enable row level security;
create index agent_runs_agent_idx on public.agent_runs (agent, agent_version, created_at);

create table public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  interview_id uuid references public.interviews (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  agent text not null,
  agent_version text not null,
  kind text not null check (kind in ('rubric')),
  items jsonb not null,
  passed int not null,
  total int not null,
  code_only boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.quality_checks enable row level security;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'queued',
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  -- Makes a job idempotent, for example one reminder per learner per session.
  dedupe_key text unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.jobs enable row level security;
create index jobs_queue_idx on public.jobs (status, run_after);

-- ---------------------------------------------------------------------------
-- Access helpers. Security definer, so policies can call them without recursion.
-- ---------------------------------------------------------------------------

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'platform_admin')::boolean, false)
$$;

create function public.is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = 'org_admin'
  )
$$;

create function public.is_org_staff(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.role in ('org_admin', 'instructor')
  )
$$;

create function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
    or exists (select 1 from public.memberships m where m.organization_id = org and m.user_id = auth.uid())
    or exists (select 1 from public.enrollments e where e.organization_id = org and e.user_id = auth.uid())
$$;

create function public.has_course_role(course uuid, wanted public.staff_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.course_id = course and m.user_id = auth.uid() and m.role = wanted
  )
$$;

create function public.is_enrolled(course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments e where e.course_id = course and e.user_id = auth.uid())
$$;

create function public.course_org(course uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select organization_id from public.courses where id = course
$$;

-- Instructors of the course, and organization admins (who manage courses).
create function public.can_manage_course(course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_course_role(course, 'instructor') or public.is_org_admin(public.course_org(course))
$$;

create function public.can_see_course(course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_enrolled(course)
    or exists (select 1 from public.memberships m where m.course_id = course and m.user_id = auth.uid())
    or public.is_org_admin(public.course_org(course))
$$;

create function public.can_read_results(course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_course_role(course, 'instructor') or public.has_course_role(course, 'sponsor')
$$;

create function public.submitted_count(p_session uuid, p_kind public.interview_kind) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.interviews i
  where i.session_id = p_session and i.kind = p_kind and i.state in ('submitted', 'analysed', 'needs_review')
$$;

-- Whether the signed-in user may read one interview's transcript, ratings and insights.
create function public.can_read_interview(p_interview uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.interviews i
    join public.courses c on c.id = i.course_id
    where i.id = p_interview
      and public.has_course_role(i.course_id, 'instructor')
      and i.state in ('submitted', 'analysed', 'needs_review')
      and i.anonymity <> 'private'
      and (i.anonymity = 'named' or public.submitted_count(i.session_id, i.kind) >= c.min_group_size)
  )
$$;

-- Public branding for an organization's pages, including the sign-in page before anyone is
-- signed in. A function rather than a readable table, so tenancy on the tables stays strict.
create function public.get_branding(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'slug', o.slug, 'name', o.name, 'logo_path', o.logo_path,
    'tokens', t.tokens
  )
  from public.organizations o
  left join public.themes t on t.id = o.live_theme_id
  where o.slug = p_slug
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_insert on public.organizations for insert to authenticated
  with check (public.is_platform_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy themes_select on public.themes for select to authenticated
  using (public.is_org_member(organization_id));
create policy themes_insert on public.themes for insert to authenticated
  with check (public.is_org_admin(organization_id));
create policy themes_update on public.themes for update to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy courses_select on public.courses for select to authenticated
  using (public.can_see_course(id));
create policy courses_insert on public.courses for insert to authenticated
  with check (public.is_org_admin(organization_id));
create policy courses_update on public.courses for update to authenticated
  using (public.can_manage_course(id)) with check (public.can_manage_course(id));

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_org_admin(organization_id)
         or (course_id is not null and public.can_manage_course(course_id)));
create policy memberships_write on public.memberships for all to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy enrollments_select on public.enrollments for select to authenticated
  using (user_id = auth.uid() or public.can_manage_course(course_id));
create policy enrollments_insert on public.enrollments for insert to authenticated
  with check (public.can_manage_course(course_id) and organization_id = public.course_org(course_id));
create policy enrollments_delete on public.enrollments for delete to authenticated
  using (public.can_manage_course(course_id));

create policy sessions_select on public.sessions for select to authenticated
  using (public.can_manage_course(course_id)
         or ((public.is_enrolled(course_id) or public.has_course_role(course_id, 'sponsor')) and state <> 'draft'));
create policy sessions_insert on public.sessions for insert to authenticated
  with check (public.can_manage_course(course_id) and organization_id = public.course_org(course_id));
create policy sessions_update on public.sessions for update to authenticated
  using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));

create policy documents_select on public.documents for select to authenticated
  using (public.can_manage_course(course_id)
         or (audience = 'learners' and public.is_enrolled(course_id)
             and exists (select 1 from public.sessions s where s.id = session_id and s.state <> 'draft')));
create policy documents_write on public.documents for all to authenticated
  using (public.can_manage_course(course_id))
  with check (public.can_manage_course(course_id) and organization_id = public.course_org(course_id));

create policy documentation_sources_select on public.documentation_sources for select to authenticated
  using (public.is_org_staff(organization_id));
create policy documentation_sources_write on public.documentation_sources for all to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy document_chunks_select on public.document_chunks for select to authenticated
  using ((course_id is not null and public.can_manage_course(course_id))
         or (course_id is null and public.is_org_staff(organization_id)));

create policy guides_select on public.guides for select to authenticated
  using (public.can_manage_course(course_id));
create policy guides_write on public.guides for all to authenticated
  using (public.can_manage_course(course_id)) with check (public.can_manage_course(course_id));

-- Interview data is written only by the server, authorized by the interview token.
create policy interviews_select on public.interviews for select to authenticated
  using (public.can_read_interview(id));
create policy interview_turns_select on public.interview_turns for select to authenticated
  using (public.can_read_interview(interview_id));
create policy ratings_select on public.ratings for select to authenticated
  using (public.can_read_interview(interview_id));
create policy insights_select on public.insights for select to authenticated
  using (public.can_read_interview(interview_id));
create policy insights_mark_accuracy on public.insights for update to authenticated
  using (public.can_read_interview(interview_id)) with check (public.can_read_interview(interview_id));

-- Learners see their own completions. Course managers see who has responded.
create policy completions_select on public.completions for select to authenticated
  using (user_id = auth.uid() or public.can_manage_course(course_id));

create policy questions_select on public.questions for select to authenticated
  using (public.can_see_course(course_id)
         and exists (select 1 from public.sessions s where s.id = session_id));
create policy questions_insert on public.questions for insert to authenticated
  with check (public.is_enrolled(course_id) and state = 'open'
              and (author_id is null or author_id = auth.uid())
              and organization_id = public.course_org(course_id)
              and exists (select 1 from public.sessions s where s.id = session_id and s.course_id = questions.course_id and s.state in ('open', 'closed')));
create policy questions_update on public.questions for update to authenticated
  using (public.has_course_role(course_id, 'instructor')) with check (public.has_course_role(course_id, 'instructor'));
create policy questions_delete on public.questions for delete to authenticated
  using (public.has_course_role(course_id, 'instructor'));

create policy answers_select on public.answers for select to authenticated
  using (public.can_see_course(course_id));
create policy answers_write on public.answers for all to authenticated
  using (public.has_course_role(course_id, 'instructor')) with check (public.has_course_role(course_id, 'instructor'));

-- Votes are private to the voter; the count lives on the question.
create policy question_votes_select on public.question_votes for select to authenticated
  using (user_id = auth.uid());
create policy question_votes_insert on public.question_votes for insert to authenticated
  with check (user_id = auth.uid() and public.is_enrolled(course_id)
              and organization_id = public.course_org(course_id));

create policy actions_select on public.actions for select to authenticated
  using (public.can_see_course(course_id));
create policy actions_write on public.actions for all to authenticated
  using (public.has_course_role(course_id, 'instructor')) with check (public.has_course_role(course_id, 'instructor'));

create policy agent_runs_select on public.agent_runs for select to authenticated
  using (public.is_platform_admin());
create policy quality_checks_select on public.quality_checks for select to authenticated
  using (public.is_platform_admin());
create policy jobs_select on public.jobs for select to authenticated
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Column grants: no time or token on interview data for signed-in users.
-- ---------------------------------------------------------------------------

revoke all on public.interviews from anon, authenticated;
grant select (id, organization_id, course_id, session_id, kind, anonymity, participant_id, state, stage,
              turn_count, summary, summary_edited, agent_version) on public.interviews to authenticated;

revoke all on public.interview_turns from anon, authenticated;
grant select (id, organization_id, interview_id, seq, role, text, mode, stage, topic) on public.interview_turns to authenticated;

revoke all on public.ratings from anon, authenticated;
grant select (id, organization_id, course_id, session_id, interview_id, kind, item_id, choice) on public.ratings to authenticated;

revoke all on public.insights from anon, authenticated;
grant select (id, organization_id, course_id, session_id, interview_id, kind, themes, blockers, suggestions,
              quotes, paraphrases, agent_version, accuracy) on public.insights to authenticated;
grant update (accuracy, accuracy_marked_by, accuracy_marked_at) on public.insights to authenticated;

revoke all on public.completions from anon, authenticated;
grant select (id, organization_id, course_id, session_id, user_id, kind, completed_on) on public.completions to authenticated;

revoke all on public.jobs, public.agent_runs, public.quality_checks, public.document_chunks from anon;
revoke insert, update, delete on public.jobs, public.agent_runs, public.quality_checks, public.document_chunks from authenticated;

-- Votes keep a count on the question, so voters stay private.
create function public.bump_vote_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.questions set vote_count = vote_count + 1 where id = new.question_id;
  elsif tg_op = 'DELETE' then
    update public.questions set vote_count = greatest(vote_count - 1, 0) where id = old.question_id;
  end if;
  return null;
end
$$;
create trigger question_votes_count after insert or delete on public.question_votes
  for each row execute function public.bump_vote_count();

-- ---------------------------------------------------------------------------
-- Realtime for the Q&A board
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.questions, public.answers;

-- ---------------------------------------------------------------------------
-- Storage: private documents served through signed URLs, public logos.
-- Paths: documents/{organization_id}/{course_id}/{session_id}/{document_id}/{file}
--        logos/{organization_id}/{file}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400),
       ('logos', 'logos', true, 2097152)
on conflict (id) do nothing;

create policy documents_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.storage_path = objects.name));
create policy documents_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_manage_course(((storage.foldername(name))[2])::uuid));
create policy documents_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can_manage_course(((storage.foldername(name))[2])::uuid));

create policy logos_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.is_org_admin(((storage.foldername(name))[1])::uuid));
