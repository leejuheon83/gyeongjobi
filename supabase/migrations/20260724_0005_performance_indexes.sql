-- 성능 개선: 자주 조회·정렬되는 컬럼에 인덱스 추가
-- 근거: 관리자 검토 화면의 부서 필터(requests.department_id),
--       전 화면의 최신순 정렬(requests.created_at), 지급 관리의 지급일 정렬(payments.paid_at)이
--       인덱스 없이 동작 중이라 데이터가 쌓일수록 느려짐.

create index idx_requests_department on requests (department_id);
create index idx_requests_created_at on requests (created_at desc);
create index idx_payments_paid_at on payments (paid_at desc);
