-- 실제 화면에서 쓰는 조회 조건에 맞춘 인덱스 보강.
--
-- 1) 알림: 모든 페이지의 레이아웃에서 사용자별 최신 20건을 매번 조회한다.
--    기존 인덱스는 (user_id, is_read)라 정렬(created_at desc)에 쓰이지 못한다.
-- 2) 관리자 검토 화면: 동일 대상자·동일 거래처 이력 조회가 조건에 맞는 인덱스 없이 돈다.
--    기존 idx_requests_duplicate_check는 선두 컬럼이 target_company라 단독 조건에 쓰이지 못한다.

create index if not exists idx_notifications_user_created
  on notifications (user_id, created_at desc);

create index if not exists idx_requests_target_name
  on requests (target_name);

create index if not exists idx_requests_client_company
  on requests (client_company);
