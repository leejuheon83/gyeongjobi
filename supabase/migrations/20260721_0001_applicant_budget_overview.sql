-- 신청서 작성 화면에 표시할 영업국별 예산 현황 (신청자도 조회 가능)
-- budget_summary()는 관리자 전용이라, 신청자에게도 열어줄 별도 함수를 둔다.
-- 노출 정보는 예산 총액·사용예정액·잔액뿐이며 신청 상세 내용 등 민감 정보는 포함하지 않는다.
create function department_budget_overview(p_year integer default extract(year from now())::integer)
returns table (
  department_id smallint,
  department_code text,
  department_name text,
  budget_amount bigint,
  committed_amount bigint,
  remaining_amount bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.code,
    d.name,
    coalesce(db.amount, 0)::bigint as budget_amount,
    coalesce((
      select sum(r.approved_amount) from requests r
      where r.department_id = d.id
        and r.status in ('APPROVED', 'PAID')
        and extract(year from coalesce(r.event_date, r.created_at)) = p_year
    ), 0)::bigint as committed_amount,
    coalesce(db.amount, 0)::bigint - coalesce((
      select sum(r.approved_amount) from requests r
      where r.department_id = d.id
        and r.status in ('APPROVED', 'PAID')
        and extract(year from coalesce(r.event_date, r.created_at)) = p_year
    ), 0)::bigint as remaining_amount
  from departments d
  left join annual_budgets ab on ab.year = p_year
  left join department_budgets db on db.annual_budget_id = ab.id and db.department_id = d.id
  where d.dept_type = 'SALES'
  order by d.id;
$$;

revoke execute on function department_budget_overview(integer) from public, anon;
grant execute on function department_budget_overview(integer) to authenticated;
