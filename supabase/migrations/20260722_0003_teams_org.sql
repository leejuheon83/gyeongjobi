-- 조직 개편: 국-팀 2단계 구조 도입
-- 영업3국 → 광고기획국 개명, 각 국 아래 3개 팀 신설.
-- 로그인은 기존대로 국(users.department_id) 단위, 신청 시 팀을 선택한다.

-- 1) 영업3국을 광고기획국으로 개명 (code는 SALES3 유지 — 내부 참조 최소화)
update departments set name = '광고기획국' where code = 'SALES3';

-- 2) 팀 테이블
create table teams (
  id smallint generated always as identity primary key,
  department_id smallint not null references departments (id),
  code text not null unique,
  name text not null,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  unique (department_id, name)
);

alter table teams enable row level security;

-- 로그인 사용자 전체 조회 (신청 시 팀 선택 목록)
create policy teams_select on teams
  for select to authenticated using (true);

-- 3) 9개 팀 시드
insert into teams (department_id, code, name, sort_order)
select d.id, v.code, v.name, v.ord
from (values
  ('SALES1', 'T01', '영업1팀', 1),
  ('SALES1', 'T02', '영업2팀', 2),
  ('SALES1', 'T03', '영업3팀', 3),
  ('SALES2', 'T04', '영업4팀', 1),
  ('SALES2', 'T05', '영업5팀', 2),
  ('SALES2', 'T06', '영업6팀', 3),
  ('SALES3', 'T07', '광고기획팀', 1),
  ('SALES3', 'T08', '공공/네트워크팀', 2),
  ('SALES3', 'T09', '사업입찰팀', 3)
) as v (dept_code, code, name, ord)
join departments d on d.code = v.dept_code;

-- 4) 신청서에 팀 (신청 시점 스냅샷, 기존 신청서는 미지정=null)
alter table requests add column team_id smallint references teams (id);
create index idx_requests_team on requests (team_id);

-- 팀은 반드시 신청서의 소속 국(department_id)에 속해야 한다
create function check_request_team_department()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.team_id is not null then
    if not exists (
      select 1 from teams t
      where t.id = new.team_id and t.department_id = new.department_id
    ) then
      raise exception '선택한 팀이 소속 국과 일치하지 않습니다';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_requests_team_department
before insert or update on requests
for each row execute function check_request_team_department();

-- 5) 팀별 예산 (국 예산을 팀으로 배분)
create table team_budgets (
  id bigint generated always as identity primary key,
  annual_budget_id bigint not null references annual_budgets (id) on delete cascade,
  team_id smallint not null references teams (id),
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (annual_budget_id, team_id)
);

alter table team_budgets enable row level security;

-- 조회는 로그인 사용자 전체, 쓰기는 set_team_budgets(정의자 권한)로만
create policy team_budgets_select on team_budgets
  for select to authenticated using (true);

-- 6) 예산 조정 이력에 팀 구분 추가 (팀 배분 변경도 이력으로 남긴다)
alter table budget_adjustments add column team_id smallint references teams (id);
