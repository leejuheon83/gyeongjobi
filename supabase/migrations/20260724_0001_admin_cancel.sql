-- 관리자 신청 취소(소프트 삭제) + 취소 시 예산 실제사용액 정합성

-- 1) 관리자 처리 함수에 CANCEL(취소) 액션 추가.
--    취소는 어느 상태에서든 가능하되 사유가 필수이며, 이미 취소된 건은 다시 취소할 수 없다.
create or replace function process_request(
  p_request_id uuid,
  p_action text,
  p_note text default null,
  p_approved_amount integer default null,
  p_expected_updated_at timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row requests%rowtype;
  v_new_status request_status;
begin
  if not is_admin() then
    raise exception '관리자만 처리할 수 있습니다';
  end if;

  select * into v_row from requests where id = p_request_id for update;
  if not found then
    raise exception '신청서를 찾을 수 없습니다';
  end if;
  if p_expected_updated_at is not null
     and v_row.updated_at is distinct from p_expected_updated_at then
    raise exception '다른 관리자가 먼저 처리했습니다. 새로고침 후 다시 확인해 주세요.';
  end if;

  v_new_status := case p_action
    when 'START_REVIEW' then 'REVIEWING'::request_status
    when 'APPROVE' then 'APPROVED'::request_status
    when 'REQUEST_REVISION' then 'REVISION_REQUESTED'::request_status
    when 'REJECT' then 'REJECTED'::request_status
    when 'CANCEL' then 'CANCELLED'::request_status
  end;
  if v_new_status is null then
    raise exception '알 수 없는 처리 유형입니다: %', p_action;
  end if;

  if p_action = 'CANCEL' then
    if v_row.status = 'CANCELLED' then
      raise exception '이미 취소된 신청입니다';
    end if;
    if p_note is null or btrim(p_note) = '' then
      raise exception '취소 사유를 입력해야 합니다';
    end if;
  end if;

  if p_action = 'APPROVE' then
    if p_approved_amount is null or p_approved_amount <= 0 then
      raise exception '승인 금액을 입력해야 합니다';
    end if;
    if v_row.requested_amount is not null
       and p_approved_amount > v_row.requested_amount then
      raise exception '승인 금액은 신청 금액을 초과할 수 없습니다';
    end if;
    if p_approved_amount is distinct from v_row.requested_amount
       and (p_note is null or btrim(p_note) = '') then
      raise exception '승인 금액이 신청 금액과 다르면 조정 사유를 입력해야 합니다';
    end if;
  end if;

  if p_action in ('REQUEST_REVISION', 'REJECT')
     and (p_note is null or btrim(p_note) = '') then
    raise exception '%', case when p_action = 'REJECT'
      then '반려 시 반려 사유를 입력해야 합니다'
      else '보완 요청 시 요청 내용을 입력해야 합니다' end;
  end if;

  perform set_config('app.status_change_note', coalesce(p_note, ''), true);

  update requests
  set status = v_new_status,
      approved_amount = case when p_action = 'APPROVE'
        then p_approved_amount else approved_amount end
  where id = p_request_id;

  perform set_config('app.status_change_note', '', true);
end;
$$;

revoke execute on function process_request(uuid, text, text, integer, timestamptz) from public, anon;
grant execute on function process_request(uuid, text, text, integer, timestamptz) to authenticated;

-- 2) 예산 실제사용액(actual_amount)이 '지급완료(PAID)' 상태 건만 반영하도록 정밀화한다.
--    (기존에는 payments 존재 여부만 봤기 때문에, 지급완료 후 취소된 건이 실제사용액에 남았다.)
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
        and r.status = 'PAID'
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

create or replace function team_budget_summary(p_year integer)
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
        and r.status = 'PAID'
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
