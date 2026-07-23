// 신청서 폼 값과 검증 (클라이언트·서버 공용)

export interface RequestFormValues {
  team_id: string;
  category: string;
  target_name: string;
  target_company: string;
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
  target_company: "",
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

export function formatAmountInput(value: string): string {
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
}

export const MAX_AMOUNT = 100_000;

const SUBMIT_REQUIRED: { key: keyof RequestFormValues; label: string }[] = [
  { key: "team_id", label: "신청 팀" },
  { key: "category", label: "경조 구분" },
  { key: "target_name", label: "대상자명" },
  { key: "target_company", label: "대상자 회사/기관" },
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
