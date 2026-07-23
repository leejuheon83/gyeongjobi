-- 최소 샘플 데이터
-- 사용자·신청서 id는 참조 편의를 위해 고정 uuid 사용 (부서 id는 identity라 code로 조회)

-- 부서
insert into departments (code, name, dept_type) values
  ('SALES1', '영업1국', 'SALES'),
  ('SALES2', '영업2국', 'SALES'),
  ('SALES3', '영업3국', 'SALES'),
  ('MGMT', '경영지원팀', 'ADMIN');

-- 사용자 (신청자 3명 + 관리자 1명)
insert into users (id, email, name, department_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'sales1@company.co.kr', '김영업',
    (select id from departments where code = 'SALES1'), 'APPLICANT'),
  ('22222222-2222-2222-2222-222222222222', 'sales2@company.co.kr', '이판매',
    (select id from departments where code = 'SALES2'), 'APPLICANT'),
  ('33333333-3333-3333-3333-333333333333', 'sales3@company.co.kr', '박세일',
    (select id from departments where code = 'SALES3'), 'APPLICANT'),
  ('99999999-9999-9999-9999-999999999999', 'admin@company.co.kr', '박관리',
    (select id from departments where code = 'MGMT'), 'ADMIN');

-- 2026년 예산
insert into annual_budgets (year, total_amount) values (2026, 31000000);

insert into department_budgets (annual_budget_id, department_id, amount) values
  ((select id from annual_budgets where year = 2026),
    (select id from departments where code = 'SALES1'), 12000000),
  ((select id from annual_budgets where year = 2026),
    (select id from departments where code = 'SALES2'), 10000000),
  ((select id from annual_budgets where year = 2026),
    (select id from departments where code = 'SALES3'), 9000000);

-- 신청서 1: 검토중 (DRAFT → SUBMITTED → REVIEWING, 이력은 트리거가 자동 기록)
insert into requests (id, applicant_id, department_id, category,
  target_company, target_name, event_date, requested_amount, reason)
values (
  'a0000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  (select id from departments where code = 'SALES1'),
  'WEDDING', '한성물산', '이철수 부장 (자녀 결혼)', '2026-07-25', 200000,
  '주요 거래처 구매팀 부장 자녀 결혼식 축의금'
);

update requests set status = 'SUBMITTED', submitted_at = now()
  where id = 'a0000000-0000-0000-0000-000000000001';
update requests set status = 'REVIEWING'
  where id = 'a0000000-0000-0000-0000-000000000001';

insert into attachments (request_id, file_name, storage_path, mime_type, size_bytes, uploaded_by)
values (
  'a0000000-0000-0000-0000-000000000001',
  '청첩장.pdf',
  'requests/a0000000-0000-0000-0000-000000000001/f47ac10b-58cc-4372-a567-0e02b2c3d479.pdf',
  'application/pdf', 245760,
  '11111111-1111-1111-1111-111111111111'
);

insert into admin_comments (request_id, admin_id, comment) values (
  'a0000000-0000-0000-0000-000000000001',
  '99999999-9999-9999-9999-999999999999',
  '증빙 자료 확인 중입니다.'
);

-- 신청서 2: 지급 완료 (SUBMITTED → REVIEWING → APPROVED → PAID)
insert into requests (id, applicant_id, department_id, category,
  target_company, target_name, event_date, requested_amount, reason)
values (
  'a0000000-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111',
  (select id from departments where code = 'SALES1'),
  'FUNERAL', '대한상사', '정민호 이사 (부친상)', '2026-07-10', 300000,
  '거래처 임원 부친상 조의금 및 화환'
);

update requests set status = 'SUBMITTED', submitted_at = now()
  where id = 'a0000000-0000-0000-0000-000000000002';
update requests set status = 'REVIEWING'
  where id = 'a0000000-0000-0000-0000-000000000002';
update requests set status = 'APPROVED', approved_amount = 300000
  where id = 'a0000000-0000-0000-0000-000000000002';
update requests set status = 'PAID'
  where id = 'a0000000-0000-0000-0000-000000000002';

insert into payments (request_id, paid_amount, paid_by, note) values (
  'a0000000-0000-0000-0000-000000000002', 300000,
  '99999999-9999-9999-9999-999999999999', '법인계좌 이체'
);

insert into notifications (user_id, request_id, type, message) values (
  '11111111-1111-1111-1111-111111111111',
  'a0000000-0000-0000-0000-000000000002',
  'PAYMENT_COMPLETED',
  '신청하신 대외경조비(대한상사, 정민호 이사)의 지급이 완료되었습니다.'
);

-- 신청서 3: 임시저장
insert into requests (id, applicant_id, department_id, category,
  target_company, target_name, event_date, requested_amount, reason)
values (
  'a0000000-0000-0000-0000-000000000003',
  '22222222-2222-2222-2222-222222222222',
  (select id from departments where code = 'SALES2'),
  'BIRTH', '동서유통', '최지연 과장 (득남)', '2026-07-05', 100000,
  '거래처 담당 과장 출산 축하'
);
