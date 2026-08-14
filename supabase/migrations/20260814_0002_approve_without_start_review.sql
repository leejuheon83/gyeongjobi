-- 제출 상태에서 "검토 시작"을 거치지 않고 바로 승인·보완요청·반려할 수 있게 한다.
--
-- 배경: 관리자가 신청서를 확인한 뒤 승인하려면 항상 "검토 시작"을 먼저 눌러야 해서
-- 클릭이 한 번 더 필요했다. 검토중(REVIEWING) 상태는 그대로 유지하되, 제출·재제출
-- 상태에서도 최종 처리로 바로 넘어갈 수 있도록 상태 전이 규칙을 넓힌다.

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
    return new;
  end if;

  v_is_admin := exists (
    select 1 from users where id = v_uid and role = 'SUPPORT_ADMIN' and is_active
  );

  if v_is_admin then
    if v_admin_content_edit then
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
        or (old.status in ('SUBMITTED', 'RESUBMITTED', 'REVIEWING')
            and new.status in ('APPROVED', 'REVISION_REQUESTED', 'REJECTED'))
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
      if old.status not in ('DRAFT', 'SUBMITTED', 'REVIEWING', 'REVISION_REQUESTED', 'RESUBMITTED') then
        raise exception '심사가 진행 중이거나 임시저장·보완요청 상태에서만 수정할 수 있습니다';
      end if;
    end if;
  end if;

  return new;
end;
$$;
