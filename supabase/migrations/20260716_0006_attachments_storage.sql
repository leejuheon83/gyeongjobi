-- 첨부파일 스토리지 구성

-- 실체 파일이 없는 샘플 첨부 메타데이터 제거
delete from attachments where storage_path like 'requests/%';

-- 비공개 버킷 (10MB 하드 리밋, 허용 MIME 제한 — 앱 설정값과 별개의 최종 방어선)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- 스토리지 객체 정책: 경로 첫 폴더 = 신청서 id
-- 조회: 해당 신청서를 볼 수 있는 사람(신청자 본인 또는 관리자)만
create policy attachments_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.requests r
      where r.id::text = (storage.foldername(name))[1]
        and (r.applicant_id = (select auth.uid()) or public.is_admin())
    )
  );

-- 업로드·삭제: 본인 신청서 + 수정 가능 상태(임시저장·보완요청)만
create policy attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.applicant_id = (select auth.uid())
        and r.status in ('DRAFT', 'REVISION_REQUESTED')
    )
  );

create policy attachments_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.applicant_id = (select auth.uid())
        and r.status in ('DRAFT', 'REVISION_REQUESTED')
    )
  );

-- 제출 이후(임시저장 단계 제외) 첨부파일 변경 이력 자동 기록
create function log_attachment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_file_name text;
  v_action text;
  v_status request_status;
begin
  if tg_op = 'INSERT' then
    v_request_id := new.request_id;
    v_file_name := new.file_name;
    v_action := '첨부파일 등록';
  else
    v_request_id := old.request_id;
    v_file_name := old.file_name;
    v_action := '첨부파일 삭제';
  end if;

  select status into v_status from requests where id = v_request_id;
  if v_status is not null and v_status <> 'DRAFT' then
    insert into request_status_history (request_id, from_status, to_status, changed_by, note)
    values (v_request_id, v_status, v_status, auth.uid(), v_action || ': ' || v_file_name);
  end if;

  return coalesce(new, old);
end;
$$;

revoke execute on function log_attachment_change() from public, anon, authenticated;

create trigger trg_attachments_log
after insert or delete on attachments
for each row execute function log_attachment_change();
