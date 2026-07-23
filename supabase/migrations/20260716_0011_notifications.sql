-- 알림: 유형 확장, 상태 변경 시 자동 발생, 주기적 점검(지급임박·장기미처리·예산부족)

alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'REQUEST_SUBMITTED',    -- 신청자: 접수 확인 / 관리자: 신규 신청
  'REQUEST_RESUBMITTED',  -- 관리자: 재신청
  'REVISION_REQUESTED',   -- 신청자: 보완 요청
  'REQUEST_APPROVED',     -- 신청자: 승인
  'REQUEST_REJECTED',     -- 신청자: 반려
  'PAYMENT_COMPLETED',    -- 신청자: 지급 완료
  'PAYMENT_DUE_SOON',     -- 관리자: 지급 희망일 임박
  'STALE_REQUEST',        -- 관리자: 장기 미처리 신청
  'BUDGET_WARNING'        -- 관리자: 예산 부족 예상
));

-- 신청서 상태가 실제로 바뀔 때마다 관련자에게 알림 생성
create or replace function log_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(current_setting('app.status_change_note', true), '')), '');
  v_is_transition boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into request_status_history (request_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, auth.uid(), v_note);
    v_is_transition := true;
  elsif new.status is distinct from old.status then
    insert into request_status_history (request_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(), v_note);
    v_is_transition := true;
  end if;

  if v_is_transition then
    if new.status = 'SUBMITTED' then
      insert into notifications (user_id, request_id, type, message)
      values (
        new.applicant_id, new.id, 'REQUEST_SUBMITTED',
        '신청하신 대외경조비(' || new.request_no || ')가 접수되었습니다.'
      );
      insert into notifications (user_id, request_id, type, message)
      select u.id, new.id, 'REQUEST_SUBMITTED', '신규 신청이 접수되었습니다: ' || new.request_no
      from users u where u.role = 'SUPPORT_ADMIN' and u.is_active;
    elsif new.status = 'RESUBMITTED' then
      insert into notifications (user_id, request_id, type, message)
      select u.id, new.id, 'REQUEST_RESUBMITTED', '재신청이 접수되었습니다: ' || new.request_no
      from users u where u.role = 'SUPPORT_ADMIN' and u.is_active;
    elsif new.status = 'REVISION_REQUESTED' then
      insert into notifications (user_id, request_id, type, message)
      values (
        new.applicant_id, new.id, 'REVISION_REQUESTED',
        '신청하신 대외경조비(' || new.request_no || ')에 보완 요청이 있습니다.'
      );
    elsif new.status = 'APPROVED' then
      insert into notifications (user_id, request_id, type, message)
      values (
        new.applicant_id, new.id, 'REQUEST_APPROVED',
        '신청하신 대외경조비(' || new.request_no || ')가 승인되었습니다.'
      );
    elsif new.status = 'REJECTED' then
      insert into notifications (user_id, request_id, type, message)
      values (
        new.applicant_id, new.id, 'REQUEST_REJECTED',
        '신청하신 대외경조비(' || new.request_no || ')가 반려되었습니다.'
      );
    elsif new.status = 'PAID' then
      insert into notifications (user_id, request_id, type, message)
      values (
        new.applicant_id, new.id, 'PAYMENT_COMPLETED',
        '신청하신 대외경조비(' || new.request_no || ')의 지급이 완료되었습니다.'
      );
    end if;
  end if;

  return new;
end;
$$;

-- 주기 점검: 지급 희망일 임박, 장기 미처리, 예산 부족 예상
-- pg_cron(세션·JWT 없음)에서도 동작해야 하므로 is_admin() 가드가 있는 budget_summary()를
-- 호출하지 않고 동일한 집계 로직을 이 함수 안에서 직접 수행한다.
create function generate_periodic_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_year int := extract(year from now())::int;
begin
  -- 1. 지급 희망일 임박 (승인 상태, 3일 이내)
  for v_req in
    select r.id, r.request_no, r.desired_payment_date
    from requests r
    where r.status = 'APPROVED'
      and r.desired_payment_date is not null
      and r.desired_payment_date between current_date and current_date + 3
      and not exists (
        select 1 from notifications n
        where n.request_id = r.id and n.type = 'PAYMENT_DUE_SOON'
          and n.created_at > now() - interval '3 days'
      )
  loop
    insert into notifications (user_id, request_id, type, message)
    select u.id, v_req.id, 'PAYMENT_DUE_SOON',
      '지급 희망일이 임박했습니다 (' || v_req.request_no || ', ' || v_req.desired_payment_date || ')'
    from users u where u.role = 'SUPPORT_ADMIN' and u.is_active;
  end loop;

  -- 2. 장기 미처리 신청 (제출 후 5일 이상 방치)
  for v_req in
    select r.id, r.request_no
    from requests r
    where r.status in ('SUBMITTED', 'RESUBMITTED', 'REVIEWING')
      and r.submitted_at is not null
      and r.submitted_at <= now() - interval '5 days'
      and not exists (
        select 1 from notifications n
        where n.request_id = r.id and n.type = 'STALE_REQUEST'
          and n.created_at > now() - interval '3 days'
      )
  loop
    insert into notifications (user_id, request_id, type, message)
    select u.id, v_req.id, 'STALE_REQUEST', '5일 이상 처리되지 않은 신청이 있습니다: ' || v_req.request_no
    from users u where u.role = 'SUPPORT_ADMIN' and u.is_active;
  end loop;

  -- 3. 예산 부족 예상 (부서별 사용예정액이 예산의 90% 이상)
  for v_req in
    select
      d.name as department_name,
      coalesce(db.amount, 0)::bigint as budget_amount,
      coalesce((
        select sum(r2.approved_amount) from requests r2
        where r2.department_id = d.id
          and r2.status in ('APPROVED', 'PAID')
          and extract(year from coalesce(r2.event_date, r2.created_at)) = v_year
      ), 0)::bigint as committed_amount
    from departments d
    left join annual_budgets ab on ab.year = v_year
    left join department_budgets db on db.annual_budget_id = ab.id and db.department_id = d.id
    where d.dept_type = 'SALES'
  loop
    if v_req.budget_amount > 0 and v_req.committed_amount >= v_req.budget_amount * 0.9 then
      if not exists (
        select 1 from notifications n
        where n.type = 'BUDGET_WARNING'
          and n.message like v_req.department_name || '%'
          and n.created_at > now() - interval '1 day'
      ) then
        insert into notifications (user_id, request_id, type, message)
        select u.id, null, 'BUDGET_WARNING',
          v_req.department_name || ' 예산이 부족할 것으로 예상됩니다 (사용예정 '
            || to_char(v_req.committed_amount, 'FM999,999,999,999') || '원 / 예산 '
            || to_char(v_req.budget_amount, 'FM999,999,999,999') || '원)'
        from users u where u.role = 'SUPPORT_ADMIN' and u.is_active;
      end if;
    end if;
  end loop;
end;
$$;

-- 일반 사용자는 호출할 수 없다 (pg_cron이 소유자 권한으로 실행)
revoke all on function generate_periodic_notifications() from public, anon, authenticated;
