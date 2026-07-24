// 신청서 폼 값과 검증 (클라이언트·서버 공용)

import type { RequestRow } from "@/lib/types";

export interface RequestFormValues {
  team_id: string;
  category: string;
  target_name: string;
  target_position: string;
  relationship: string;
  client_company: string;
  sales_rep_name: string;
  occurrence_date: string;
  event_date: string;
  location: string;
  reason: string;
  business_relevance: string;
  amount: string; // 천 단위 콤마 포함 문자열
  payment_method: string;
  desired_payment_date: string;
  special_request: string;
}

export const EMPTY_VALUES: RequestFormValues = {
  team_id: "",
  category: "",
  target_name: "",
  target_position: "",
  relationship: "",
  client_company: "",
  sales_rep_name: "",
  occurrence_date: "",
  event_date: "",
  location: "",
  reason: "",
  business_relevance: "",
  amount: "",
  payment_method: "",
  desired_payment_date: "",
  special_request: "",
};

export function parseAmount(value: string): number | null {
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

// requests 행을 폼 값으로 변환한다 (신청자 수정, 관리자 수정 양쪽에서 공용)
export function toFormValues(r: RequestRow): RequestFormValues {
  return {
    team_id: r.team_id != null ? String(r.team_id) : "",
    category: r.category ?? "",
    target_name: r.target_name ?? "",
    target_position: r.target_position ?? "",
    relationship: r.relationship ?? "",
    client_company: r.client_company ?? "",
    sales_rep_name: r.sales_rep_name ?? "",
    occurrence_date: r.occurrence_date ?? "",
    event_date: r.event_date ?? "",
    location: r.location ?? "",
    reason: r.reason ?? "",
    business_relevance: r.business_relevance ?? "",
    amount: r.requested_amount != null ? r.requested_amount.toLocaleString("ko-KR") : "",
    payment_method: r.payment_method ?? "",
    desired_payment_date: r.desired_payment_date ?? "",
    special_request: r.special_request ?? "",
  };
}

// 폼 값을 requests 테이블 컬럼 형태로 변환한다 (신청자 작성, 관리자 수정 양쪽에서 공용)
export function toRequestFields(values: RequestFormValues) {
  const t = (s: string) => (s.trim() ? s.trim() : null);
  return {
    team_id: values.team_id.trim() ? Number(values.team_id) : null,
    category: t(values.category),
    target_name: t(values.target_name),
    // 별도 입력을 받지 않고 거래처명을 그대로 사용한다 (두 필드가 실질적으로 중복이라 UI에서 통합)
    target_company: t(values.client_company),
    target_position: t(values.target_position),
    relationship: t(values.relationship),
    client_company: t(values.client_company),
    sales_rep_name: t(values.sales_rep_name),
    occurrence_date: t(values.occurrence_date),
    event_date: t(values.event_date),
    location: t(values.location),
    reason: t(values.reason),
    business_relevance: t(values.business_relevance),
    requested_amount: parseAmount(values.amount),
    payment_method: t(values.payment_method),
    desired_payment_date: t(values.desired_payment_date),
    special_request: t(values.special_request),
  };
}

export function formatAmountInput(value: string): string {
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
}

export const MAX_AMOUNT = 100_000;

const SUBMIT_REQUIRED: { key: keyof RequestFormValues; label: string }[] = [
  { key: "team_id", label: "신청 팀" },
  { key: "category", label: "경조 구분" },
  { key: "target_name", label: "대상자명" },
  { key: "relationship", label: "신청자와의 관계" },
  { key: "client_company", label: "거래처명" },
  { key: "occurrence_date", label: "경조 발생일" },
  { key: "event_date", label: "행사일" },
  { key: "reason", label: "신청 사유" },
  { key: "business_relevance", label: "업무 연관성" },
  { key: "payment_method", label: "지급 형태" },
];

export function validateRequest(
  values: RequestFormValues,
  mode: "draft" | "submit",
): Partial<Record<keyof RequestFormValues, string>> {
  const errors: Partial<Record<keyof RequestFormValues, string>> = {};

  if (!values.target_name.trim()) {
    errors.target_name = "대상자명을 입력해 주세요.";
  }

  const amount = parseAmount(values.amount);
  if (values.amount.trim() && amount !== null) {
    if (amount <= 0) {
      errors.amount = "신청 금액은 0보다 커야 합니다.";
    } else if (amount > MAX_AMOUNT) {
      errors.amount = `신청 금액은 ${MAX_AMOUNT.toLocaleString("ko-KR")}원을 초과할 수 없습니다.`;
    }
  }

  if (mode === "submit") {
    for (const { key, label } of SUBMIT_REQUIRED) {
      if (!values[key].trim()) {
        errors[key] = `${label}을(를) 입력해 주세요.`;
      }
    }
    if (!errors.amount && (amount === null || amount <= 0)) {
      errors.amount = "신청 금액은 0보다 큰 값이어야 합니다.";
    }
  }

  return errors;
}
