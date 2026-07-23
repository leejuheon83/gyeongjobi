-- 관리자 통계·다운로드: 리포트 조회 함수, 다운로드 이력

-- 필터 조건에 맞는 신청 목록을 통계·다운로드에 공용으로 사용할 형태로 반환
-- (화면 통계와 다운로드 파일이 동일한 결과 집합을 쓰도록 하기 위한 단일 소스)
create function admin_request_report(
  p_from date default null,
  p_to date default null,
  p_department_id smallint default null,
  p_applicant text default null,
  p_status request_status default null,
  p_category event_category default null,
  p_client text default null,
  p_pay_from date default null,
  p_pay_to date default null
)
returns table (
  id uuid,
  request_no text,
  department_name text,
  applicant_name text,
  target_name text,
  client_company text,
  category event_category,
  requested_amount integer,
  approved_amount integer,
  paid_amount integer,
  submitted_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  status request_status,
  attachment_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception '관리자만 통계를 조회할 수 있습니다';
  end if;

  return query
  select
    r.id,
    r.request_no,
    d.name,
    u.name,
    r.target_name,
    r.client_company,
    r.category,
    r.requested_amount,
    r.approved_amount,
    p.paid_amount,
    r.submitted_at,
    (
      select h.created_at from request_status_history h
      where h.request_id = r.id and h.to_status = 'APPROVED'
      order by h.id asc limit 1
    ),
    p.paid_at,
    r.status,
    (
      select count(*) from attachments a
      where a.request_id = r.id and a.context = 'APPLICATION'
    )
  from requests r
  join departments d on d.id = r.department_id
  join users u on u.id = r.applicant_id
  left join payments p on p.request_id = r.id
  where r.status <> 'DRAFT'
    and (p_from is null or r.created_at >= p_from::timestamptz)
    and (p_to is null or r.created_at < (p_to + 1)::timestamptz)
    and (p_department_id is null or r.department_id = p_department_id)
    and (p_applicant is null or u.name ilike '%' || p_applicant || '%')
    and (p_status is null or r.status = p_status)
    and (p_category is null or r.category = p_category)
    and (p_client is null or r.client_company ilike '%' || p_client || '%')
    and (p_pay_from is null or r.desired_payment_date >= p_pay_from)
    and (p_pay_to is null or r.desired_payment_date <= p_pay_to)
  order by r.created_at desc;
end;
$$;

revoke execute on function admin_request_report(
  date, date, smallint, text, request_status, event_category, text, date, date
) from public, anon;
grant execute on function admin_request_report(
  date, date, smallint, text, request_status, event_category, text, date, date
) to authenticated;

-- 다운로드 이력 (삭제 금지)
create table report_downloads (
  id bigint generated always as identity primary key,
  downloaded_by uuid not null references users (id),
  filters jsonb not null,
  row_count integer not null,
  downloaded_at timestamptz not null default now()
);

create index idx_report_downloads_admin on report_downloads (downloaded_by, downloaded_at);

alter table report_downloads enable row level security;

create policy report_downloads_select on report_downloads
  for select to authenticated using (is_admin());

create policy report_downloads_insert on report_downloads
  for insert to authenticated
  with check (is_admin() and downloaded_by = (select auth.uid()));

create function prevent_report_download_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '다운로드 이력은 수정하거나 삭제할 수 없습니다';
end;
$$;

create trigger trg_report_downloads_no_update
before update on report_downloads
for each row execute function prevent_report_download_change();

create trigger trg_report_downloads_no_delete
before delete on report_downloads
for each row execute function prevent_report_download_change();
