-- 보안 점검 후 과도하게 열린 조회 권한을 좁힌다.
--
-- 1) users: 정책이 `using (true)`라 로그인한 모든 사용자가 전 직원의 이메일·역할·소속을
--    REST API로 그대로 내려받을 수 있었다. 본인 행과 관리자 행만 보이도록 제한한다.
--    (관리자 행은 처리 이력의 담당자 이름 표시, 신규 신청 알림 메일 수신자 조회에 필요하다.)
-- 2) team_budgets: 정책이 `using (true)`라 다른 영업국의 팀별 배분 예산까지 조회할 수 있었다.
--    team_budget_overview 함수는 소속 부서로 이미 제한하고 있어, 테이블 정책만 맞추면 된다.
-- 3) enforce_team_budget: 트리거 전용 함수인데 SECURITY DEFINER + PUBLIC 실행 권한이라
--    /rest/v1/rpc/enforce_team_budget 로 노출돼 있었다. 실행 권한을 회수한다.

drop policy if exists users_select on users;
create policy users_select on users
  for select to authenticated
  using (
    id = (select auth.uid())
    or is_admin()
    or role = 'SUPPORT_ADMIN'
  );

drop policy if exists team_budgets_select on team_budgets;
create policy team_budgets_select on team_budgets
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1
      from teams t
      join users u on u.id = (select auth.uid())
      where t.id = team_budgets.team_id
        and t.department_id = u.department_id
    )
  );

revoke execute on function enforce_team_budget() from public, anon, authenticated;
