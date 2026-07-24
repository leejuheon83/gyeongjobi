-- 관리자 신청 내용 수정 + 취소 상태 전이 허용 (기존 enforce_request_update 보강)
--
-- 배경: enforce_request_update() 트리거가 원래 "관리자는 신청 내용을 수정할 수 없다",
-- "관리자가 만들 수 있는 상태는 REVIEWING/APPROVED/REVISION_REQUESTED/REJECTED/PAID뿐"으로
-- 하드코딩되어 있어, 관리자 취소(CANCELLED)와 관리자 내용 수정이 모두 막혀 있었다.
--
-- 이 마이그레이션은:
-- 1) admin_update_request_content() 함수를 통해서만(세션 설정 app.admin_content_edit로 표시)
--    관리자의 신청 내용 수정을 허용한다. 다른 경로(직접 update 등)로는 여전히 차단된다.
-- 2) 관리자가 어떤 상태에서도 CANCELLED로 전이할 수 있도록 허용한다.

create or replace function enforce_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_admin_content_edit boolean := coalesce(current_setting('app.admin_content_edit', true), '') = 'true';
begin
  if v_uid is null then
    return new; -- 서비스 컨텍스트(SQL 콘솔, service role)
  end if;

  v_is_admin := exists (
    select 1 from users where id = v_uid and role = 'SUPPORT_ADMIN' and is_active
  );

  if v_is_admin then
    if v_admin_content_edit then
      -- admin_update_request_content() 안에서만 설정되는 플래그. 신청자·소속만 보호한다.
      if new.applicant_id is distinct from old.applicant_id
         or new.department_id is distinct from old.department_id then
        raise exception '신청자·소속 부서는 변경할 수 없습니다';
      end if;
    else
      if (new.applicant_id, new.department_id, new.category, new.target_company,
          new.target_name, new.event_date, new.requested_amount, new.reason)
         is distinct from
         (old.applicant_id, old.department_id, old.category, old.target_company,
          old.target_name, old.event_date, old.requested_amount, old.reason) then
        raise exception '관리자는 신청 내용을 수정할 수 없습니다';
      end if;
    end if;
    if new.status is distinct from old.status then
      if not (
        (old.status in ('SUBMITTED', 'RESUBMITTED') and new.status = 'REVIEWING')
        or (old.status = 'REVIEWING' and new.status in ('APPROVED', 'REVISION_REQUESTED', 'REJECTED'))
        or (old.status = 'APPROVED' and new.status = 'PAID')
        or (old.status <> 'CANCELLED' and new.status = 'CANCELLED')
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

-- 관리자 전용 신청 내용 수정 함수. 트랜잭션 안에서 플래그를 세우고 바로 update하므로
-- 위 트리거의 예외 경로가 이 함수를 통한 수정만 허용한다.
create function admin_update_request_content(
  p_request_id uuid,
  p_team_id smallint,
  p_category text,
  p_target_name text,
  p_target_company text,
  p_target_position text,
  p_relationship text,
  p_client_company text,
  p_sales_rep_name text,
  p_occurrence_date date,
  p_event_date date,
  p_location text,
  p_reason text,
  p_business_relevance text,
  p_requested_amount integer,
  p_payment_method text,
  p_desired_payment_date date,
  p_special_request text,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated_count int;
begin
  if not is_admin() then
    raise exception '관리자만 처리할 수 있습니다';
  end if;
  if p_requested_amount is null or p_requested_amount <= 0 then
    raise exception '신청 금액을 입력해야 합니다';
  end if;

  perform set_config('app.admin_content_edit', 'true', true);

  update requests set
    team_id = p_team_id,
    category = p_category::event_category,
    target_name = p_target_name,
    target_company = p_target_company,
    target_position = p_target_position,
    relationship = p_relationship,
    client_company = p_client_company,
    sales_rep_name = p_sales_rep_name,
    occurrence_date = p_occurrence_date,
    event_date = p_event_date,
    location = p_location,
    reason = p_reason,
    business_relevance = p_business_relevance,
    requested_amount = p_requested_amount,
    payment_method = p_payment_method,
    desired_payment_date = p_desired_payment_date,
    special_request = p_special_request
  where id = p_request_id
    and updated_at = p_expected_updated_at;

  get diagnostics v_updated_count = row_count;

  perform set_config('app.admin_content_edit', '', true);

  if v_updated_count = 0 then
    raise exception '신청서를 찾을 수 없거나, 다른 화면에서 먼저 저장된 내용이 있습니다. 새로고침 후 다시 시도해 주세요.';
  end if;
end;
$$;

revoke execute on function admin_update_request_content(
  uuid, smallint, text, text, text, text, text, text, text,
  date, date, text, text, text, integer, text, date, text, timestamptz
) from public, anon;
grant execute on function admin_update_request_content(
  uuid, smallint, text, text, text, text, text, text, text,
  date, date, text, text, text, integer, text, date, text, timestamptz
) to authenticated;
