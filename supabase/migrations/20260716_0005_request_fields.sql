-- 신청서 항목 확장 및 임시저장 지원

alter table requests
  add column target_position text,        -- 대상자 직위
  add column relationship text,           -- 신청자와의 관계
  add column client_company text,         -- 거래처명 (대상자 회사와 별도)
  add column sales_rep_name text,         -- 담당 영업사원
  add column occurrence_date date,        -- 경조 발생일 (행사일과 별도)
  add column location text,               -- 장소
  add column business_relevance text,     -- 업무 연관성
  add column payment_method text check (payment_method in ('TRANSFER', 'CASH', 'WREATH', 'OTHER')),
  add column desired_payment_date date,   -- 지급 희망일
  add column special_request text;        -- 요청사항

-- 임시저장은 미완성 상태를 허용
alter table requests
  alter column target_company drop not null,
  alter column target_name drop not null,
  alter column event_date drop not null,
  alter column requested_amount drop not null,
  alter column category drop not null;

-- 기존 샘플 데이터 보정 (완결성 제약 추가 전)
update requests set
  relationship = coalesce(relationship, '거래처 담당자'),
  client_company = coalesce(client_company, target_company),
  occurrence_date = coalesce(occurrence_date, event_date),
  business_relevance = coalesce(business_relevance, '주요 거래처 관계 유지'),
  payment_method = coalesce(payment_method, 'TRANSFER')
where status <> 'DRAFT';

-- 임시저장이 아닌 신청서는 필수 항목이 모두 채워져 있어야 함
alter table requests add constraint requests_required_when_submitted check (
  status in ('DRAFT', 'CANCELLED')
  or (
    category is not null
    and target_name is not null
    and target_company is not null
    and relationship is not null
    and client_company is not null
    and occurrence_date is not null
    and event_date is not null
    and reason is not null
    and business_relevance is not null
    and requested_amount is not null
    and payment_method is not null
  )
);
