-- 팀별 배분 예산을 초과하는 신청 제출을 차단한다.
--
-- 배경: 지금까지는 팀 예산 초과가 화면에 경고로만 표시되고 실제로는 제출이 막히지 않았다.
-- 신청자가 제출/재신청(또는 제출 상태에서의 내용 수정)으로 팀의 남은 예산(배분 예산 - 승인·지급완료
-- 합계)을 초과하는 금액을 넣으면 차단한다. 팀 예산이 아직 배분되지 않은 팀은 잔여 예산이 0으로
-- 취급되어 어떤 금액이든 차단된다 (의도된 동작 — 관리자가 팀 배분을 먼저 해야 신청 가능).
--
-- 관리자가 관리자 화면에서 신청 내용을 수정하는 경우(admin_update_request_content)는 이 검사를
-- 적용하지 않는다 — 관리자는 이미 예산 초과 승인이 가능하도록 설계되어 있으므로 동일한 원칙을 유지한다.

create or replace function enforce_team_budget()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin_content_edit boolean := coalesce(current_setting('app.admin_content_edit', true), '') = 'true';
  v_year int;
  v_budget bigint;
  v_committed bigint;
begin
  if v_uid is null or is_admin() or v_admin_content_edit then
    return new; -- 서비스 컨텍스트·관리자 수정은 하드 블록 대상이 아님
  end if;

  if new.status not in ('SUBMITTED', 'RESUBMITTED') then
    return new;
  end if;
  if new.team_id is null or new.requested_amount is null then
    return new;
  end if;

  v_year := extract(year from coalesce(new.event_date, new.created_at, now()));

  select coalesce(tb.amount, 0) into v_budget
  from teams t
  left join annual_budgets ab on ab.year = v_year
  left join team_budgets tb on tb.annual_budget_id = ab.id and tb.team_id = t.id
  where t.id = new.team_id;

  select coalesce(sum(r.approved_amount), 0) into v_committed
  from requests r
  where r.team_id = new.team_id
    and r.status in ('APPROVED', 'PAID')
    and extract(year from coalesce(r.event_date, r.created_at)) = v_year
    and r.id is distinct from new.id;

  if new.requested_amount > (v_budget - v_committed) then
    raise exception '팀 배분 예산을 초과했습니다 (잔액 %원, 신청 금액 %원). 관리자에게 팀 예산 배분을 요청해 주세요.',
      to_char(v_budget - v_committed, 'FM999,999,999,999'),
      to_char(new.requested_amount, 'FM999,999,999,999');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_requests_team_budget on requests;
create trigger trg_requests_team_budget
  before insert or update on requests
  for each row execute function enforce_team_budget();
