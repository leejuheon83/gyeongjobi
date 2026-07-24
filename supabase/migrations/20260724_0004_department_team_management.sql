-- 조직개편 대응: 부서/팀을 관리자 화면에서 추가·개명·비활성화할 수 있도록 지원
-- 1) departments.is_active 컬럼 추가 (teams에는 이미 존재)
-- 2) departments/teams admin 전용 쓰기 RLS 정책 추가
-- 3) update_annual_budget을 부서 개수와 무관한 배열 기반으로 재작성
-- 4) department_budget_overview/team_budget_overview 중복 서브쿼리 제거 + 비활성 부서 제외

-- 1) 부서 활성 여부
alter table departments
  add column is_active boolean not null default true;

-- 2) 쓰기 정책 (기존 budget_adjustments_insert와 동일하게 is_admin() 사용)
create policy departments_insert on departments
  for insert to authenticated with check (is_admin());
create policy departments_update on departments
  for update to authenticated using (is_admin()) with check (is_admin());

create policy teams_insert on teams
  for insert to authenticated with check (is_admin());
create policy teams_update on teams
  for update to authenticated using (is_admin()) with check (is_admin());

-- 3) 연간 예산 편성/조정 — 부서 배열 기반 (SALES1~3 하드코딩 제거)
-- 기존 시그니처(smallint, bigint, bigint, bigint, bigint, text)를 대체하므로 먼저 drop
drop function if exists update_annual_budget(smallint, bigint, bigint, bigint, bigint, text);

create function update_annual_budget(
  p_year smallint,
  p_department_ids smallint[],
  p_amounts bigint[],
  p_common_amount bigint,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_annual_id bigint;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_dept_id smallint;
  v_amount bigint;
  v_old bigint;
  i int;
begin
  if not is_admin() then
    raise exception '관리자만 예산을 관리할 수 있습니다';
  end if;
  if array_length(p_department_ids, 1) is distinct from array_length(p_amounts, 1) then
    raise exception '부서와 금액 개수가 일치하지 않습니다';
  end if;
  if p_common_amount < 0 then
    raise exception '예산 금액은 0 이상이어야 합니다';
  end if;

  select id into v_annual_id from annual_budgets where year = p_year for update;
  if not found then
    insert into annual_budgets (year, total_amount, common_amount)
    values (p_year, 0, 0)
    returning id into v_annual_id;
  end if;

  for i in 1 .. coalesce(array_length(p_department_ids, 1), 0) loop
    v_dept_id := p_department_ids[i];
    v_amount := p_amounts[i];
    if v_amount < 0 then
      raise exception '예산 금액은 0 이상이어야 합니다';
    end if;
    if not exists (
      select 1 from departments where id = v_dept_id and dept_type = 'SALES'
    ) then
      raise exception '유효하지 않은 부서입니다';
    end if;

    select amount into v_old from department_budgets
      where annual_budget_id = v_annual_id and department_id = v_dept_id;

    if not found then
      if v_amount <> 0 and v_reason is null then
        raise exception '예산 조정 사유를 입력해야 합니다';
      end if;
      insert into department_budgets (annual_budget_id, department_id, amount)
      values (v_annual_id, v_dept_id, v_amount);
      if v_amount <> 0 then
        insert into budget_adjustments
          (annual_budget_id, department_id, previous_amount, new_amount, reason, adjusted_by)
        values (v_annual_id, v_dept_id, 0, v_amount, v_reason, v_admin_id);
      end if;
    elsif v_old is distinct from v_amount then
      if v_reason is null then
        raise exception '예산 조정 사유를 입력해야 합니다';
      end if;
      update department_budgets set amount = v_amount
        where annual_budget_id = v_annual_id and department_id = v_dept_id;
      insert into budget_adjustments
        (annual_budget_id, department_id, previous_amount, new_amount, reason, adjusted_by)
      values (v_annual_id, v_dept_id, v_old, v_amount, v_reason, v_admin_id);
    end if;
  end loop;

  select common_amount into v_old from annual_budgets where id = v_annual_id;
  if v_old is distinct from p_common_amount then
    if v_reason is null then
      raise exception '예산 조정 사유를 입력해야 합니다';
    end if;
    update annual_budgets set common_amount = p_common_amount where id = v_annual_id;
    insert into budget_adjustments
      (annual_budget_id, department_id, previous_amount, new_amount, reason, adjusted_by)
    values (v_annual_id, null, v_old, p_common_amount, v_reason, v_admin_id);
  end if;
end;
$$;

revoke execute on function update_annual_budget(smallint, smallint[], bigint[], bigint, text)
  from public, anon;
grant execute on function update_annual_budget(smallint, smallint[], bigint[], bigint, text)
  to authenticated;

-- 4) 신청자용 예산 현황 함수 재작성
--    - committed 서브쿼리를 lateral로 한 번만 계산 (기존엔 remaining 계산에서 중복 실행)
--    - 비활성 부서(is_active = false) 제외
create or replace function department_budget_overview(
  p_year integer default extract(year from now())::integer
)
returns table (
  department_id smallint,
  department_code text,
  department_name text,
  budget_amount bigint,
  committed_amount bigint,
  remaining_amount bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.code,
    d.name,
    coalesce(db.amount, 0)::bigint as budget_amount,
    coalesce(c.committed, 0)::bigint as committed_amount,
    (coalesce(db.amount, 0) - coalesce(c.committed, 0))::bigint as remaining_amount
  from departments d
  left join annual_budgets ab on ab.year = p_year
  left join department_budgets db on db.annual_budget_id = ab.id and db.department_id = d.id
  left join lateral (
    select sum(r.approved_amount) as committed
    from requests r
    where r.department_id = d.id
      and r.status in ('APPROVED', 'PAID')
      and extract(year from coalesce(r.event_date, r.created_at)) = p_year
  ) c on true
  where d.dept_type = 'SALES'
    and d.is_active
    and (
      is_admin()
      or d.id = (select u.department_id from users u where u.id = auth.uid())
    )
  order by d.id;
$$;

create or replace function team_budget_overview(
  p_year integer default extract(year from now())::integer
)
returns table (
  team_id smallint,
  team_code text,
  team_name text,
  department_id smallint,
  department_name text,
  budget_amount bigint,
  committed_amount bigint,
  remaining_amount bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.code,
    t.name,
    d.id,
    d.name,
    coalesce(tb.amount, 0)::bigint as budget_amount,
    coalesce(c.committed, 0)::bigint as committed_amount,
    (coalesce(tb.amount, 0) - coalesce(c.committed, 0))::bigint as remaining_amount
  from teams t
  join departments d on d.id = t.department_id
  left join annual_budgets ab on ab.year = p_year
  left join team_budgets tb on tb.annual_budget_id = ab.id and tb.team_id = t.id
  left join lateral (
    select sum(r.approved_amount) as committed
    from requests r
    where r.team_id = t.id
      and r.status in ('APPROVED', 'PAID')
      and extract(year from coalesce(r.event_date, r.created_at)) = p_year
  ) c on true
  where t.is_active
    and d.is_active
    and (
      is_admin()
      or t.department_id = (select u.department_id from users u where u.id = auth.uid())
    )
  order by t.department_id, t.sort_order;
$$;

-- budget_summary도 비활성 부서 제외 (예산 편성 화면 기준)
create or replace function budget_summary(p_year integer)
returns table (
  department_id smallint,
  department_code text,
  department_name text,
  budget_amount bigint,
  committed_amount bigint,
  actual_amount bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception '관리자만 예산 현황을 조회할 수 있습니다';
  end if;

  return query
  select
    d.id,
    d.code,
    d.name,
    coalesce(db.amount, 0)::bigint,
    coalesce((
      select sum(r.approved_amount) from requests r
      where r.department_id = d.id
        and r.status in ('APPROVED', 'PAID')
        and extract(year from coalesce(r.event_date, r.created_at)) = p_year
    ), 0)::bigint,
    coalesce((
      select sum(p.paid_amount) from payments p
      join requests r on r.id = p.request_id
      where r.department_id = d.id
        and extract(year from coalesce(r.event_date, r.created_at)) = p_year
    ), 0)::bigint
  from departments d
  left join annual_budgets ab on ab.year = p_year
  left join department_budgets db on db.annual_budget_id = ab.id and db.department_id = d.id
  where d.dept_type = 'SALES' and d.is_active
  order by d.id;
end;
$$;
