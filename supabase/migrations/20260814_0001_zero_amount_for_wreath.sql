-- 화환·기타 지급 형태는 신청 금액 0원을 허용한다.
--
-- 배경: 화환은 회사가 물품으로 직접 처리하고, 기타 지급도 금액이 확정되지 않는 경우가 있어
-- 신청 금액을 0원으로 접수해야 하는 실무 요구가 있다. 계좌이체·현금은 기존대로 0원을 막는다.
-- 신청만 0원으로 받고 승인·지급에서 막히면 처리가 끝나지 않으므로, 승인/지급 단계도 함께 완화한다.

alter table requests drop constraint if exists requests_requested_amount_check;
alter table requests add constraint requests_requested_amount_check
  check (
    requested_amount > 0
    or (requested_amount = 0 and payment_method in ('WREATH', 'OTHER'))
  );

alter table payments drop constraint if exists payments_paid_amount_check;
alter table payments add constraint payments_paid_amount_check
  check (paid_amount >= 0);

-- 승인: 신청 금액이 0원인 건은 승인 금액도 0원으로 처리할 수 있게 한다.
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
    if p_approved_amount is null or p_approved_amount < 0 then
      raise exception '승인 금액을 입력해야 합니다';
    end if;
    if p_approved_amount = 0 and coalesce(v_row.requested_amount, -1) <> 0 then
      raise exception '승인 금액은 0보다 커야 합니다';
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

-- 지급 완료: 0원 지급을 허용한다 (승인 금액과 다르면 기존대로 사유가 필요하다).
create or replace function complete_payment(
  p_request_id uuid,
  p_paid_amount integer,
  p_paid_at date,
  p_accounting_reference text,
  p_note text,
  p_diff_reason text,
  p_expected_updated_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_row requests%rowtype;
  v_payment_id bigint;
  v_diff_reason text := nullif(btrim(coalesce(p_diff_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_accounting text := nullif(btrim(coalesce(p_accounting_reference, '')), '');
begin
  if not is_admin() then
    raise exception '관리자만 지급 처리를 할 수 있습니다';
  end if;
  if p_paid_amount is null or p_paid_amount < 0 then
    raise exception '실제 지급 금액을 입력해야 합니다';
  end if;
  if p_paid_at is null then
    raise exception '지급일을 입력해야 합니다';
  end if;

  select * into v_row from requests where id = p_request_id for update;
  if not found then
    raise exception '신청서를 찾을 수 없습니다';
  end if;
  if p_expected_updated_at is not null
     and v_row.updated_at is distinct from p_expected_updated_at then
    raise exception '다른 관리자가 먼저 처리했습니다. 새로고침 후 다시 확인해 주세요.';
  end if;
  if v_row.status <> 'APPROVED' then
    raise exception '승인 상태의 신청만 지급 완료할 수 있습니다';
  end if;
  if v_row.approved_amount is distinct from p_paid_amount and v_diff_reason is null then
    raise exception '승인 금액과 실제 지급 금액이 다르면 사유를 입력해야 합니다';
  end if;

  insert into payments (
    request_id, paid_amount, paid_at, paid_by, accounting_reference, note, amount_diff_reason
  ) values (
    p_request_id, p_paid_amount, p_paid_at, v_admin_id, v_accounting, v_note, v_diff_reason
  ) returning id into v_payment_id;

  perform set_config(
    'app.status_change_note',
    '지급 완료 (' || to_char(p_paid_amount, 'FM999,999,999,999') || '원)'
      || case when v_diff_reason is not null then ' - 금액 차이 사유: ' || v_diff_reason else '' end,
    true
  );
  update requests set status = 'PAID' where id = p_request_id;
  perform set_config('app.status_change_note', '', true);

  return v_payment_id;
end;
$$;

create or replace function correct_payment(
  p_payment_id bigint,
  p_paid_amount integer,
  p_paid_at date,
  p_accounting_reference text,
  p_note text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_row payments%rowtype;
  v_request_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_accounting text := nullif(btrim(coalesce(p_accounting_reference, '')), '');
  v_prev jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if not is_admin() then
    raise exception '관리자만 지급 내역을 수정할 수 있습니다';
  end if;
  if v_reason is null then
    raise exception '변경 사유를 입력해야 합니다';
  end if;
  if p_paid_amount is null or p_paid_amount < 0 then
    raise exception '실제 지급 금액을 입력해야 합니다';
  end if;
  if p_paid_at is null then
    raise exception '지급일을 입력해야 합니다';
  end if;

  select * into v_row from payments where id = p_payment_id for update;
  if not found then
    raise exception '지급 내역을 찾을 수 없습니다';
  end if;
  v_request_id := v_row.request_id;

  if v_row.paid_amount is distinct from p_paid_amount then
    v_prev := v_prev || jsonb_build_object('paid_amount', v_row.paid_amount);
    v_new := v_new || jsonb_build_object('paid_amount', p_paid_amount);
  end if;
  if v_row.paid_at::date is distinct from p_paid_at then
    v_prev := v_prev || jsonb_build_object('paid_at', v_row.paid_at::date);
    v_new := v_new || jsonb_build_object('paid_at', p_paid_at);
  end if;
  if v_row.accounting_reference is distinct from v_accounting then
    v_prev := v_prev || jsonb_build_object('accounting_reference', v_row.accounting_reference);
    v_new := v_new || jsonb_build_object('accounting_reference', v_accounting);
  end if;
  if v_row.note is distinct from v_note then
    v_prev := v_prev || jsonb_build_object('note', v_row.note);
    v_new := v_new || jsonb_build_object('note', v_note);
  end if;

  if v_prev = '{}'::jsonb then
    raise exception '변경된 내용이 없습니다';
  end if;

  update payments set
    paid_amount = p_paid_amount,
    paid_at = p_paid_at,
    accounting_reference = v_accounting,
    note = v_note,
    amount_diff_reason = case
      when v_row.paid_amount is distinct from p_paid_amount then v_reason
      else amount_diff_reason
    end
  where id = p_payment_id;

  insert into payment_corrections (payment_id, previous_values, new_values, reason, corrected_by)
  values (p_payment_id, v_prev, v_new, v_reason, v_admin_id);

  insert into request_status_history (request_id, from_status, to_status, changed_by, note)
  values (v_request_id, 'PAID', 'PAID', v_admin_id, '지급 내역 정정: ' || v_reason);
end;
$$;

-- 관리자 수정 함수도 동일한 규칙을 따르도록 금액 검사를 완화한다.
create or replace function admin_update_request_content(
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
  if p_requested_amount is null then
    raise exception '신청 금액을 입력해야 합니다';
  end if;
  if p_requested_amount <= 0 and coalesce(p_payment_method, '') not in ('WREATH', 'OTHER') then
    raise exception '신청 금액은 0보다 커야 합니다 (화환·기타 지급만 0원 허용)';
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
