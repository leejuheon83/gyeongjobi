-- 역할명 변경 (APPLICANT → SALES_USER, ADMIN → SUPPORT_ADMIN) 및 RLS 정책

alter table users drop constraint users_role_check;
update users set role = 'SALES_USER' where role = 'APPLICANT';
update users set role = 'SUPPORT_ADMIN' where role = 'ADMIN';
alter table users add constraint users_role_check
  check (role in ('SALES_USER', 'SUPPORT_ADMIN'));

create or replace function check_user_role_department()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_dept_type text;
begin
  select dept_type into v_dept_type from departments where id = new.department_id;
  if new.role = 'SUPPORT_ADMIN' and v_dept_type <> 'ADMIN' then
    raise exception '관리자는 경영지원팀 소속이어야 합니다';
  end if;
  if new.role = 'SALES_USER' and v_dept_type <> 'SALES' then
    raise exception '신청자는 영업국 소속이어야 합니다';
  end if;
  return new;
end;
$$;

-- 관리자 여부 판별 (RLS 정책에서 사용, definer로 users RLS 우회)
create function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users
    where id = auth.uid() and role = 'SUPPORT_ADMIN' and is_active
  );
$$;

revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- 신청서 수정 규칙 (RLS보다 세밀한 상태 전이·필드 검증)
create function enforce_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_uid is null then
    return new; -- 서비스 컨텍스트(SQL 콘솔, service role)
  end if;

  v_is_admin := exists (
    select 1 from users where id = v_uid and role = 'SUPPORT_ADMIN' and is_active
  );

  if v_is_admin then
    if (new.applicant_id, new.department_id, new.category, new.target_company,
        new.target_name, new.event_date, new.requested_amount, new.reason)
       is distinct from
       (old.applicant_id, old.department_id, old.category, old.target_company,
        old.target_name, old.event_date, old.requested_amount, old.reason) then
      raise exception '관리자는 신청 내용을 수정할 수 없습니다';
    end if;
    if new.status is distinct from old.status then
      if not (
        (old.status in ('SUBMITTED', 'RESUBMITTED') and new.status = 'REVIEWING')
        or (old.status = 'REVIEWING' and new.status in ('APPROVED', 'REVISION_REQUESTED', 'REJECTED'))
        or (old.status = 'APPROVED' and new.status = 'PAID')
      ) then
        raise exception '허용되지 않는 상태 변경입니다 (% → %)', old.status, new.status;
      end if;
      if new.status = 'APPROVED' and new.approved_amount is null then
        raise exception '승인 시 승인 금액을 입력해야 합니다';
      end if;
    end if;
  else
    if new.applicant_id is distinct from old.applicant_id
       or new.department_id is distinct from old.department_id
       or new.approved_amount is distinct from old.approved_amount then
      raise exception '신청자는 승인 정보를 변경할 수 없습니다';
    end if;
    if new.status is distinct from old.status then
      if (old.status = 'DRAFT' and new.status = 'SUBMITTED')
         or (old.status = 'REVISION_REQUESTED' and new.status = 'RESUBMITTED') then
        new.submitted_at := now();
      elsif old.status in ('DRAFT', 'SUBMITTED', 'REVIEWING', 'REVISION_REQUESTED', 'RESUBMITTED')
            and new.status = 'CANCELLED' then
        -- 승인 전 취소 허용, 취소하면서 내용 변경은 금지
        if (new.category, new.target_company, new.target_name, new.event_date,
            new.requested_amount, new.reason)
           is distinct from
           (old.category, old.target_company, old.target_name, old.event_date,
            old.requested_amount, old.reason) then
          raise exception '취소 시 신청 내용은 변경할 수 없습니다';
        end if;
      else
        raise exception '허용되지 않는 상태 변경입니다 (% → %)', old.status, new.status;
      end if;
    else
      if old.status not in ('DRAFT', 'REVISION_REQUESTED') then
        raise exception '임시저장 또는 보완요청 상태에서만 수정할 수 있습니다';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function enforce_request_update() from public, anon, authenticated;

create trigger trg_requests_enforce_update
before update on requests
for each row execute function enforce_request_update();

-- 제출 상태로 바로 생성 시 submitted_at 설정
create or replace function set_request_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.request_no is null then
    new.request_no := 'REQ-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('request_no_seq')::text, 4, '0');
  end if;
  if new.status = 'SUBMITTED' and new.submitted_at is null then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

-- ── RLS 정책 ──────────────────────────────────────────────

-- 부서: 로그인 사용자 전체 조회
create policy departments_select on departments
  for select to authenticated using (true);

-- 사용자: 로그인 사용자 전체 조회 (이름 표시용), 쓰기는 관리 콘솔에서만
create policy users_select on users
  for select to authenticated using (true);

-- 신청서
create policy requests_select on requests
  for select to authenticated
  using (applicant_id = (select auth.uid()) or is_admin());

create policy requests_insert on requests
  for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and status in ('DRAFT', 'SUBMITTED')
    and exists (
      select 1 from users u
      where u.id = (select auth.uid())
        and u.role = 'SALES_USER'
        and u.is_active
        and u.department_id = requests.department_id
    )
  );

-- 신청자 수정: 본인 건 + 승인 전 상태만 (세부 규칙은 trg_requests_enforce_update)
create policy requests_update_applicant on requests
  for update to authenticated
  using (
    applicant_id = (select auth.uid())
    and status in ('DRAFT', 'SUBMITTED', 'REVIEWING', 'REVISION_REQUESTED', 'RESUBMITTED')
  )
  with check (applicant_id = (select auth.uid()));

create policy requests_update_admin on requests
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- 첨부파일: 해당 신청서가 보이는 사람만 조회, 작성자 본인만 수정 가능 상태에서 추가·삭제
create policy attachments_select on attachments
  for select to authenticated
  using (
    exists (
      select 1 from requests r
      where r.id = request_id
        and (r.applicant_id = (select auth.uid()) or is_admin())
    )
  );

create policy attachments_insert on attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from requests r
      where r.id = request_id
        and r.applicant_id = (select auth.uid())
        and r.status in ('DRAFT', 'REVISION_REQUESTED')
    )
  );

create policy attachments_delete on attachments
  for delete to authenticated
  using (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from requests r
      where r.id = request_id
        and r.applicant_id = (select auth.uid())
        and r.status in ('DRAFT', 'REVISION_REQUESTED')
    )
  );

-- 상태 이력: 해당 신청서가 보이는 사람만 조회 (기록은 definer 트리거가 수행)
create policy status_history_select on request_status_history
  for select to authenticated
  using (
    exists (
      select 1 from requests r
      where r.id = request_id
        and (r.applicant_id = (select auth.uid()) or is_admin())
    )
  );

-- 관리자 의견: 해당 신청서가 보이는 사람만 조회, 작성은 관리자만
create policy admin_comments_select on admin_comments
  for select to authenticated
  using (
    exists (
      select 1 from requests r
      where r.id = request_id
        and (r.applicant_id = (select auth.uid()) or is_admin())
    )
  );

create policy admin_comments_insert on admin_comments
  for insert to authenticated
  with check (is_admin() and admin_id = (select auth.uid()));

-- 예산: 관리자 전용
create policy annual_budgets_admin on annual_budgets
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy department_budgets_admin on department_budgets
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- 지급 내역: 관리자 전체, 신청자는 본인 신청 건만 조회. 등록은 관리자만, 수정·삭제 불가
create policy payments_select on payments
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from requests r
      where r.id = request_id and r.applicant_id = (select auth.uid())
    )
  );

create policy payments_insert on payments
  for insert to authenticated
  with check (is_admin() and paid_by = (select auth.uid()));

-- 알림: 본인 것만 조회·읽음 처리
create policy notifications_select on notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update on notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
