-- 지급 관리: 지급 완료 처리, 지급 정정 이력, 지급 증빙파일

alter table payments
  add column accounting_reference text,
  add column amount_diff_reason text;

-- 지급 정정 이력 (삭제 금지)
create table payment_corrections (
  id bigint generated always as identity primary key,
  payment_id bigint not null references payments (id) on delete cascade,
  previous_values jsonb not null,
  new_values jsonb not null,
  reason text not null,
  corrected_by uuid not null references users (id),
  corrected_at timestamptz not null default now()
);

create index idx_payment_corrections_payment on payment_corrections (payment_id);

alter table payment_corrections enable row level security;

create policy payment_corrections_select on payment_corrections
  for select to authenticated using (is_admin());

create function prevent_payment_correction_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '지급 정정 이력은 수정하거나 삭제할 수 없습니다';
end;
$$;

create trigger trg_payment_corrections_no_update
before update on payment_corrections
for each row execute function prevent_payment_correction_change();

create trigger trg_payment_corrections_no_delete
before delete on payment_corrections
for each row execute function prevent_payment_correction_change();

-- 첨부파일에 지급 증빙 구분 추가 (신청서 증빙과 분리 관리)
alter table attachments
  add column context text not null default 'APPLICATION' check (context in ('APPLICATION', 'PAYMENT'));

drop policy attachments_insert on attachments;
create policy attachments_insert on attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (context = 'APPLICATION' and exists (
        select 1 from requests r
        where r.id = request_id
          and r.applicant_id = (select auth.uid())
          and r.status in ('DRAFT', 'REVISION_REQUESTED')
      ))
      or
      (context = 'PAYMENT' and is_admin() and exists (
        select 1 from requests r
        where r.id = request_id and r.status in ('APPROVED', 'PAID')
      ))
    )
  );

drop policy attachments_delete on attachments;
create policy attachments_delete on attachments
  for delete to authenticated
  using (
    (context = 'APPLICATION' and uploaded_by = (select auth.uid()) and exists (
      select 1 from requests r
      where r.id = request_id
        and r.applicant_id = (select auth.uid())
        and r.status in ('DRAFT', 'REVISION_REQUESTED')
    ))
    or
    (context = 'PAYMENT' and is_admin())
  );

-- 스토리지: 지급 증빙은 {request_id}/payment/{file} 경로 사용
create policy attachments_storage_insert_payment on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[2] = 'payment'
    and is_admin()
    and exists (
      select 1 from public.requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.status in ('APPROVED', 'PAID')
    )
  );

create policy attachments_storage_delete_payment on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[2] = 'payment'
    and is_admin()
  );

-- 지급 완료 처리 (승인 상태에서만, 중복 방지, 예산 실제사용액은 payments 반영으로 자동 계산됨)
create function complete_payment(
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
  if p_paid_amount is null or p_paid_amount <= 0 then
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

revoke execute on function complete_payment(uuid, integer, date, text, text, text, timestamptz)
  from public, anon;
grant execute on function complete_payment(uuid, integer, date, text, text, text, timestamptz)
  to authenticated;

-- 지급 내역 정정 (관리자 전용, 사유·이력 필수)
create function correct_payment(
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
  if p_paid_amount is null or p_paid_amount <= 0 then
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

revoke execute on function correct_payment(bigint, integer, date, text, text, text)
  from public, anon;
grant execute on function correct_payment(bigint, integer, date, text, text, text)
  to authenticated;
