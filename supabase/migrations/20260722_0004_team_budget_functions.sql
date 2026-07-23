-- 팀 예산 배분·집계 함수

-- 국 예산을 소속 팀에 배분한다.
-- - 배분 합계는 해당 국의 예산을 초과할 수 없다.
-- - 변경분이 있으면 조정 사유가 필요하고, budget_adjustments에 팀 단위 이력을 남긴다.
create function set_team_budgets(
  p_year smallint,
  p_department_id smallint,
  p_team_ids smallint[],
  p_amounts bigint[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_annual_id bigint;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_dept_budget bigint;
  v_sum bigint := 0;
  v_old bigint;
  v_team_id smallint;
  v_amount bigint;
  i int;
begin
  if not is_admin() then
    raise exception '관리자만 예산을 관리할 수 있습니다';
  end if;
  if array_length(p_team_ids, 1) is distinct from array_length(p_amounts, 1) then
    raise exception '팀과 금액 개수가 일치하지 않습니다';
  end if;

  -- 연도 예산 존재 확인
  select id into v_annual_id from annual_budgets where year = p_year for update;
  if not found then
    raise exception '먼저 해당 연도의 국 예산을 편성해 주세요';
  end if;

  -- 국 예산 (배분 상한)
  select amount into v_dept_budget from department_budgets
    where annual_budget_id = v_annual_id and department_id = p_department_id;
  if not found then
    v_dept_budget := 0;
  end if;

  -- 팀 검증 + 합계
  for i in 1 .. coalesce(array_length(p_team_ids, 1), 0) loop
    v_team_id := p_team_ids[i];
    v_amount := p_amounts[i];
    if v_amount < 0 then
      raise exception '예산 금액은 0 이상이어야 합니다';
    end if;
    if not exists (
      select 1 from teams t where t.id = v_team_id and t.department_id = p_department_id
    ) then
      raise exception '선택한 팀이 해당 국에 속하지 않습니다';
    end if;
    v_sum := v_sum + v_amount;
  end loop;

  if v_sum > v_dept_budget then
    raise exception '팀 배분 합계(%)가 국 예산(%)을 초과합니다', v_sum, v_dept_budget;
  end if;

  -- 각 팀 배분 반영 (변경분만 이력)
  for i in 1 .. coalesce(array_length(p_team_ids, 1), 0) loop
    v_team_id := p_team_ids[i];
    v_amount := p_amounts[i];

    select amount into v_old from team_budgets
      where annual_budget_id = v_annual_id and team_id = v_team_id;

    if not found then
      if v_amount <> 0 and v_reason is null then
        raise exception '예산 조정 사유를 입력해야 합니다';
      end if;
      insert into team_budgets (annual_budget_id, team_id, amount)
      values (v_annual_id, v_team_id, v_amount);
      if v_amount <> 0 then
        insert into budget_adjustments
          (annual_budget_id, department_id, team_id, previous_amount, new_amount, reason, adjusted_by)
        values (v_annual_id, p_department_id, v_team_id, 0, v_amount, v_reason, v_admin_id);
      end if;
    elsif v_old is distinct from v_amount then
      if v_reason is null then
        raise exception '예산 조정 사유를 입력해야 합니다';
      end if;
      update team_budgets set amount = v_amount
        where annual_budget_id = v_annual_id and team_id = v_team_id;
      insert into budget_adjustments
        (annual_budget_id, department_id, team_id, previous_amount, new_amount, reason, adjusted_by)
      values (v_annual_id, p_department_id, v_team_id, v_old, v_amount, v_reason, v_admin_id);
    end if;
  end loop;
end;
$$;

revoke execute on function set_team_budgets(smallint, smallint, smallint[], bigint[], text)
  from public, anon;
grant execute on function set_team_budgets(smallint, smallint, smallint[], bigint[], text)
  to authenticated;

-- 팀별 예산·사용 현황 (관리자 전용)
-- 사용예정액: 승인·지급완료 건의 승인 금액 합 (팀 기준)
-- 실제사용액: 지급완료 건의 실제 지급 금액 합 (팀 기준)
create function team_budget_summary(p_year integer)
returns table (
  team_id smallint,
  team_code text,
  team_name text,
  department_id smallint,
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
    t.id,
    t.code,
    t.name,
    d.id,
    d.name,
    coalesce(tb.amount, 0)::bigint,
    coalesce((
      select sum(r.approved_amount) from requests r
      where r.team_id = t.id
        and r.status in ('APPROVED', 'PAID')
        and extract(year from coalesce(r.event_date, r.created_at)) = p_year
    ), 0)::bigint,
    coalesce((
      select sum(p.paid_amount) from payments p
      join requests r on r.id = p.request_id
      where r.team_id = t.id
        and extract(year from coalesce(r.event_date, r.created_at)) = p_year
    ), 0)::bigint
  from teams t
  join departments d on d.id = t.department_id
  left join annual_budgets ab on ab.year = p_year
  left join team_budgets tb on tb.annual_budget_id = ab.id and tb.team_id = t.id
  where t.is_active
  order by t.department_id, t.sort_order;
end;
$$;

revoke execute on function team_budget_summary(integer) from public, anon;
grant execute on function team_budget_summary(integer) to authenticated;
