-- 신청자용 팀별 예산 현황 (대시보드 표시용)
-- department_budget_overview와 동일한 보안 모델: 관리자는 전체, 신청자는 본인 소속 국의 팀만.
-- 노출 정보는 예산·사용예정액·잔액뿐이며 신청 상세 등 민감 정보는 없다.
create function team_budget_overview(p_year integer default extract(year from now())::integer)
returns table (
  team_id smallint,
  team_code text,
  team_name text,
  department_id smallint,
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
    t.id,
    t.code,
    t.name,
    d.id,
    d.name,
    coalesce(tb.amount, 0)::bigint as budget_amount,
    coalesce((
      select sum(r.approved_amount) from requests r
      where r.team_id = t.id
        and r.status in ('APPROVED', 'PAID')
        and extract(year from coalesce(r.event_date, r.created_at)) = p_year
    ), 0)::bigint as committed_amount,
    coalesce(tb.amount, 0)::bigint - coalesce((
      select sum(r.approved_amount) from requests r
      where r.team_id = t.id
        and r.status in ('APPROVED', 'PAID')
        and extract(year from coalesce(r.event_date, r.created_at)) = p_year
    ), 0)::bigint as remaining_amount
  from teams t
  join departments d on d.id = t.department_id
  left join annual_budgets ab on ab.year = p_year
  left join team_budgets tb on tb.annual_budget_id = ab.id and tb.team_id = t.id
  where t.is_active
    and (
      is_admin()
      or t.department_id = (select u.department_id from users u where u.id = auth.uid())
    )
  order by t.department_id, t.sort_order;
$$;

revoke execute on function team_budget_overview(integer) from public, anon;
grant execute on function team_budget_overview(integer) to authenticated;
