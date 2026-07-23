-- 영업국별 예산 조회 범위 제한: 관리자는 전체, 신청자는 본인 소속 영업국만
create or replace function department_budget_overview(p_year integer default extract(year from now())::integer)
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
    and (
      is_admin()
      or d.id = (select u.department_id from users u where u.id = auth.uid())
    )
  order by d.id;
$$;
