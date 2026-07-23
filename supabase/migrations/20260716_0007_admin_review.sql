-- 관리자 검토 기능: 내부 메모, 처리 의견 이력 기록, 동시 처리 충돌 방지

-- 관리자 의견에 내부 메모 구분 추가
alter table admin_comments add column is_internal boolean not null default false;

-- 신청자는 공개 의견만, 관리자는 전체 조회
drop policy admin_comments_select on admin_comments;
create policy admin_comments_select on admin_comments
  for select to authenticated
  using (
    is_admin()
    or (
      not is_internal
      and exists (
        select 1 from requests r
        where r.id = request_id and r.applicant_id = (select auth.uid())
      )
    )
  );

-- 상태 변경 이력에 처리 의견(note)을 함께 기록할 수 있도록 트랜잭션 설정값 사용
create or replace function log_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(current_setting('app.status_change_note', true), '')), '');
begin
  if tg_op = 'INSERT' then
    insert into request_status_history (request_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, auth.uid(), v_note);
  elsif new.status is distinct from old.status then
    insert into request_status_history (request_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(), v_note);
  end if;
  return new;
end;
$$;

-- 관리자 처리 함수 (검토 시작·승인·보완요청·반려)
-- security invoker: 기존 RLS·상태 전이 트리거가 그대로 적용된다
create function process_request(
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

  -- 행 잠금 + 기대 시각 비교로 두 관리자의 동시 처리 충돌 방지
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
  end;
  if v_new_status is null then
    raise exception '알 수 없는 처리 유형입니다: %', p_action;
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
