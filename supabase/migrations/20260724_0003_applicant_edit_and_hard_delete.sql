-- 1) 신청자가 제출·검토중·재제출 상태에서도 내용을 직접 수정할 수 있도록 허용
--    (RLS는 이미 이 상태들을 허용하고 있었음 — 트리거만 DRAFT/REVISION_REQUESTED로 막고 있었다)
-- 2) 관리자 완전 삭제(하드 삭제) 기능 + 삭제돼도 남는 별도 감사 로그

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
      -- 심사가 최종 결정(승인·반려)되기 전 상태에서는 신청자가 내용을 계속 고칠 수 있다
      if old.status not in ('DRAFT', 'SUBMITTED', 'REVIEWING', 'REVISION_REQUESTED', 'RESUBMITTED') then
        raise exception '심사가 진행 중이거나 임시저장·보완요청 상태에서만 수정할 수 있습니다';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 완전 삭제 감사 로그 (요청 행이 사라진 뒤에도 누가·언제·왜 지웠는지 남긴다. 수정·삭제 금지)
create table request_deletion_log (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  request_no text not null,
  deleted_by uuid not null references users (id),
  deleted_at timestamptz not null default now(),
  reason text not null,
  snapshot jsonb not null
);

alter table request_deletion_log enable row level security;

create policy request_deletion_log_select on request_deletion_log
  for select to authenticated using (is_admin());

create policy request_deletion_log_insert on request_deletion_log
  for insert to authenticated
  with check (is_admin() and deleted_by = (select auth.uid()));

create function prevent_deletion_log_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '삭제 로그는 수정하거나 삭제할 수 없습니다';
end;
$$;

create trigger trg_deletion_log_no_update
before update on request_deletion_log
for each row execute function prevent_deletion_log_change();

create trigger trg_deletion_log_no_delete
before delete on request_deletion_log
for each row execute function prevent_deletion_log_change();

-- 관리자 전용 완전 삭제. 지급완료 건은 기존 trg_requests_no_paid_delete /
-- payments FK(on delete restrict)가 그대로 막는다 (이 함수가 별도로 우회하지 않음).
create function admin_delete_request(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_row requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_deleted_count int;
begin
  if not is_admin() then
    raise exception '관리자만 삭제할 수 있습니다';
  end if;
  if v_reason is null then
    raise exception '삭제 사유를 입력해야 합니다';
  end if;

  select * into v_row from requests where id = p_request_id for update;
  if not found then
    raise exception '신청서를 찾을 수 없습니다';
  end if;
  if v_row.status = 'PAID' then
    raise exception '지급완료된 신청서는 삭제할 수 없습니다. 신청 취소를 이용해 주세요.';
  end if;

  insert into request_deletion_log (request_id, request_no, deleted_by, reason, snapshot)
  values (v_row.id, v_row.request_no, v_admin_id, v_reason, to_jsonb(v_row));

  begin
    delete from storage.objects
    where bucket_id = 'attachments'
      and (storage.foldername(name))[1] = v_row.id::text;
  exception when others then
    -- Storage API 전용 제약 등으로 직접 삭제가 막힐 수 있다. 실제 파일이 남더라도
    -- 신청서 자체 삭제는 계속 진행한다(비공개 버킷이라 접근 불가, 추후 정리 가능).
    null;
  end;

  delete from requests where id = p_request_id;
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count = 0 then
    raise exception '삭제 권한이 없거나 신청서를 찾을 수 없습니다';
  end if;
end;
$$;

revoke execute on function admin_delete_request(uuid, text) from public, anon;
grant execute on function admin_delete_request(uuid, text) to authenticated;

-- RLS는 원래 신청서 삭제를 전면 차단했다(완전 삭제 자체를 지원하지 않는 설계였음).
-- 관리자에 한해 삭제를 허용한다 (지급완료 건은 위 함수·기존 트리거가 이중으로 막는다).
create policy requests_delete_admin on requests
  for delete to authenticated
  using (is_admin());
