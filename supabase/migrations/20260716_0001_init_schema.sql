-- 대외경조비 관리시스템 초기 스키마

-- 열거형
create type request_status as enum (
  'DRAFT',
  'SUBMITTED',
  'REVIEWING',
  'REVISION_REQUESTED',
  'RESUBMITTED',
  'APPROVED',
  'REJECTED',
  'PAID',
  'CANCELLED'
);

create type event_category as enum (
  'WEDDING',   -- 결혼
  'FUNERAL',   -- 조의
  'BIRTH',     -- 출산
  'HOSPITAL',  -- 병문안
  'OTHER'      -- 기타
);

-- 부서 (영업국 + 경영지원팀)
create table departments (
  id smallint generated always as identity primary key,
  code text not null unique,
  name text not null unique,
  dept_type text not null check (dept_type in ('SALES', 'ADMIN'))
);

-- 사용자
-- 3단계 인증 도입 시 id를 auth.users.id와 동일하게 맞춘다
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  department_id smallint not null references departments (id),
  role text not null check (role in ('APPLICANT', 'ADMIN')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 신청자는 영업국, 관리자는 경영지원팀 소속만 허용
create function check_user_role_department()
returns trigger
language plpgsql
as $$
declare
  v_dept_type text;
begin
  select dept_type into v_dept_type from departments where id = new.department_id;
  if new.role = 'ADMIN' and v_dept_type <> 'ADMIN' then
    raise exception '관리자는 경영지원팀 소속이어야 합니다';
  end if;
  if new.role = 'APPLICANT' and v_dept_type <> 'SALES' then
    raise exception '신청자는 영업국 소속이어야 합니다';
  end if;
  return new;
end;
$$;

create trigger trg_users_role_dept
before insert or update on users
for each row execute function check_user_role_department();

-- 신청서
create sequence request_no_seq;

create table requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  applicant_id uuid not null references users (id),
  department_id smallint not null references departments (id), -- 신청 시점 소속 스냅샷
  category event_category not null,
  target_company text not null, -- 거래처명 (중복 신청 확인용)
  target_name text not null,    -- 대상자명 (중복 신청 확인용)
  event_date date not null,     -- 행사일 (중복 신청 확인용)
  requested_amount integer not null check (requested_amount > 0), -- 신청 금액
  approved_amount integer check (approved_amount >= 0),           -- 승인 금액
  reason text,
  status request_status not null default 'DRAFT',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_requests_duplicate_check on requests (target_company, target_name, event_date);
create index idx_requests_applicant on requests (applicant_id);
create index idx_requests_status on requests (status);

create function set_request_no()
returns trigger
language plpgsql
as $$
begin
  if new.request_no is null then
    new.request_no := 'REQ-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('request_no_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_requests_no
before insert on requests
for each row execute function set_request_no();

create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_requests_updated_at
before update on requests
for each row execute function set_updated_at();

-- 첨부파일 (메타데이터와 실제 저장 위치를 분리)
create table attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests (id) on delete cascade,
  file_name text not null,                              -- 사용자가 올린 원본 파일명
  storage_bucket text not null default 'attachments',   -- 실제 저장 버킷
  storage_path text not null unique,                    -- 실제 저장 경로
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  uploaded_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

create index idx_attachments_request on attachments (request_id);

-- 상태 변경 이력 (트리거로 자동 기록)
create table request_status_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references requests (id) on delete cascade,
  from_status request_status, -- 최초 생성 시 null
  to_status request_status not null,
  changed_by uuid references users (id), -- 인증 도입 전에는 null
  note text,
  created_at timestamptz not null default now()
);

create index idx_status_history_request on request_status_history (request_id);

create function log_request_status_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    insert into request_status_history (request_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into request_status_history (request_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_requests_status_history
after insert or update on requests
for each row execute function log_request_status_change();

-- 관리자 의견
create table admin_comments (
  id bigint generated always as identity primary key,
  request_id uuid not null references requests (id) on delete cascade,
  admin_id uuid not null references users (id),
  comment text not null,
  created_at timestamptz not null default now()
);

create index idx_admin_comments_request on admin_comments (request_id);

-- 연도별 예산
create table annual_budgets (
  id bigint generated always as identity primary key,
  year smallint not null unique check (year between 2000 and 2100),
  total_amount bigint not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

-- 영업국별 예산 (연도별 예산에 종속)
create table department_budgets (
  id bigint generated always as identity primary key,
  annual_budget_id bigint not null references annual_budgets (id) on delete cascade,
  department_id smallint not null references departments (id),
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (annual_budget_id, department_id)
);

-- 지급 내역 (삭제 금지)
create table payments (
  id bigint generated always as identity primary key,
  request_id uuid not null unique references requests (id), -- on delete restrict(기본값): 지급된 신청서 삭제 차단
  paid_amount integer not null check (paid_amount > 0), -- 실제 지급 금액
  paid_at timestamptz not null default now(),
  paid_by uuid not null references users (id),
  note text,
  created_at timestamptz not null default now()
);

create function prevent_payment_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '지급 내역은 삭제할 수 없습니다';
end;
$$;

create trigger trg_payments_no_delete
before delete on payments
for each row execute function prevent_payment_delete();

create function prevent_paid_request_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'PAID' then
    raise exception '지급 완료된 신청서는 삭제할 수 없습니다';
  end if;
  return old;
end;
$$;

create trigger trg_requests_no_paid_delete
before delete on requests
for each row execute function prevent_paid_request_delete();

-- 알림
create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade, -- 수신자
  request_id uuid references requests (id) on delete set null,
  type text not null check (type in ('STATUS_CHANGED', 'COMMENT_ADDED', 'PAYMENT_COMPLETED')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on notifications (user_id, is_read);

-- RLS: 정책은 3단계(인증·권한)에서 추가. 그 전까지 API 접근 전면 차단.
alter table departments enable row level security;
alter table users enable row level security;
alter table requests enable row level security;
alter table attachments enable row level security;
alter table request_status_history enable row level security;
alter table admin_comments enable row level security;
alter table annual_budgets enable row level security;
alter table department_budgets enable row level security;
alter table payments enable row level security;
alter table notifications enable row level security;
