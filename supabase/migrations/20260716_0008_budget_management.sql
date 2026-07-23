-- 예산 관리: 공통 예산, 조정 이력, 서버 계산 함수

alter table annual_budgets
  add column common_amount bigint not null default 0 check (common_amount >= 0);

-- 전체 예산 = 영업국별 예산 합계 + 공통 예산 (직접 입력 금지, 항상 자동 계산)
create function recompute_budget_total(p_annual_budget_id bigint)
returns void
language plpgsql
set search_path = public
as $$
begin
  update annual_budgets
  set total_amount = coalesce(
        (select sum(amount) from department_budgets where annual_budget_id = p_annual_budget_id), 0)
      + (select common_amount from annual_budgets where id = p_annual_budget_id)
  where id = p_annual_budget_id;
end;
$$;

create function trg_recompute_from_dept_budgets()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform recompute_budget_total(coalesce(new.annual_budget_id, old.annual_budget_id));
  return coalesce(new, old);
end;
$$;

create trigger trg_dept_budgets_recompute
after insert or update or delete on department_budgets
for each row execute function trg_recompute_from_dept_budgets();

create function trg_recompute_from_common()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform recompute_budget_total(new.id);
  return new;
end;
$$;

create trigger trg_annual_budget_recompute
after update of common_amount on annual_budgets
for each row execute function trg_recompute_from_common();

-- 예산 조정 이력 (삭제 금지)
create table budget_adjustments (
  id bigint generated always as identity primary key,
  annual_budget_id bigint not null references annual_budgets (id) on delete cascade,
  department_id smallint references departments (id), -- null = 공통 예산
  previous_amount bigint not null,
  new_amount bigint not null,
  reason text not null,
  adjusted_by uuid not null references users (id),
  adjusted_at timestamptz not null default now()
);

create index idx_budget_adjustments_annual on budget_adjustments (annual_budget_id);

alter table budget_adjustments enable row level security;

create policy budget_adjustments_select on budget_adjustments
  for select to authenticated using (is_admin());

create policy budget_adjustments_insert on budget_adjustments
  for insert to authenticated
  with check (is_admin() and adjusted_by = (select auth.uid()));

create function prevent_budget_adjustment_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '예산 조정 이력은 수정하거나 삭제할 수 없습니다';
end;
$$;

create trigger trg_budget_adjustments_no_update
before update on budget_adjustments
for each row execute function prevent_budget_adjustment_change();

create trigger trg_budget_adjustments_no_delete
before delete on budget_adjustments
for each row execute function prevent_budget_adjustment_change();

-- 연간 예산 편성/조정 (영업1~3국 + 공통예산을 한 번에 반영, 변경분만 이력 기록)
create function update_annual_budget(
  p_year smallint,
  p_sales1_amount bigint,
  p_sales2_amount bigint,
  p_sales3_amount bigint,
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
  v_codes text[] := array['SALES1', 'SALES2', 'SALES3'];
  v_new_amounts bigint[] := array[p_sales1_amount, p_sales2_amount, p_sales3_amount];
  v_dept_id smallint;
  v_old bigint;
  i int;
begin
  if not is_admin() then
    raise exception '관리자만 예산을 관리할 수 있습니다';
  end if;
  if p_sales1_amount < 0 or p_sales2_amount < 0 or p_sales3_amount < 0 or p_common_amount < 0 then
    raise exception '예산 금액은 0 이상이어야 합니다';
  end if;

  select id into v_annual_id from annual_budgets where year = p_year for update;
  if not found then
    insert into annual_budgets (year, total_amount, common_amount)
    values (p_year, 0, 0)
    returning id into v_annual_id;
  end if;

  for i in 1..3 loop
    select id into v_dept_id from departments where code = v_codes[i];
    select amount into v_old from department_budgets
      where annual_budget_id = v_annual_id and department_id = v_dept_id;

    if not found then
      v_old := 0;
      if v_new_amounts[i] <> 0 and v_reason is null then
        raise exception '예산 조정 사유를 입력해야 합니다';
      end if;
      insert into department_budgets (annual_budget_id, department_id, amount)
      values (v_annual_id, v_dept_id, v_new_amounts[i]);
      if v_new_amounts[i] <> 0 then
        insert into budget_adjustments
          (annual_budget_id, department_id, previous_amount, new_amount, reason, adjusted_by)
        values (v_annual_id, v_dept_id, 0, v_new_amounts[i], v_reason, v_admin_id);
      end if;
    elsif v_old is distinct from v_new_amounts[i] then
      if v_reason is null then
        raise exception '예산 조정 사유를 입력해야 합니다';
      end if;
      update department_budgets set amount = v_new_amounts[i]
        where annual_budget_id = v_annual_id and department_id = v_dept_id;
      insert into budget_adjustments
        (annual_budget_id, department_id, previous_amount, new_amount, reason, adjusted_by)
      values (v_annual_id, v_dept_id, v_old, v_new_amounts[i], v_reason, v_admin_id);
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

revoke execute on function update_annual_budget(smallint, bigint, bigint, bigint, bigint, text)
  from public, anon;
grant execute on function update_annual_budget(smallint, bigint, bigint, bigint, bigint, text)
  to authenticated;

-- 부서별 예산·사용 현황 (서버 계산 — 화면은 이 결과만 표시)
-- 사용예정액: 승인(APPROVED)·지급완료(PAID) 건의 승인 금액 합
-- 실제사용액: 지급완료(PAID) 건의 실제 지급 금액 합
-- 임시저장·제출·검토중·보완요청·재제출·반려·취소 건은 제외
create function budget_summary(p_year integer)
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
  where d.dept_type = 'SALES'
  order by d.id;
end;
$$;

revoke execute on function budget_summary(integer) from public, anon;
grant execute on function budget_summary(integer) to authenticated;
