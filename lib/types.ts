export type RequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "REVIEWING"
  | "REVISION_REQUESTED"
  | "RESUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "PAID"
  | "CANCELLED";

export type EventCategory = "WEDDING" | "FUNERAL" | "BIRTH" | "HOSPITAL" | "OTHER";

export type PaymentMethod = "TRANSFER" | "CASH" | "WREATH" | "OTHER";

export type UserRole = "SALES_USER" | "SUPPORT_ADMIN";

export const STATUS_LABEL: Record<RequestStatus, string> = {
  DRAFT: "임시저장",
  SUBMITTED: "제출",
  REVIEWING: "검토중",
  REVISION_REQUESTED: "보완요청",
  RESUBMITTED: "재제출",
  APPROVED: "승인",
  REJECTED: "반려",
  PAID: "지급완료",
  CANCELLED: "취소",
};

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  WEDDING: "결혼",
  FUNERAL: "조의",
  BIRTH: "출산",
  HOSPITAL: "병문안",
  OTHER: "기타",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  TRANSFER: "계좌이체",
  CASH: "현금",
  WREATH: "화환",
  OTHER: "기타",
};

export interface TeamRow {
  id: number;
  department_id: number;
  code: string;
  name: string;
  sort_order: number;
}

export interface RequestRow {
  id: string;
  request_no: string;
  applicant_id: string;
  department_id: number;
  team_id: number | null;
  category: EventCategory | null;
  target_name: string | null;
  target_company: string | null;
  target_position: string | null;
  relationship: string | null;
  client_company: string | null;
  sales_rep_name: string | null;
  occurrence_date: string | null;
  event_date: string | null;
  location: string | null;
  reason: string | null;
  business_relevance: string | null;
  requested_amount: number | null;
  approved_amount: number | null;
  payment_method: PaymentMethod | null;
  desired_payment_date: string | null;
  special_request: string | null;
  status: RequestStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestWithNames extends RequestRow {
  applicant: { name: string } | null;
  department: { name: string } | null;
}

export type AttachmentContext = "APPLICATION" | "PAYMENT";

export interface AttachmentRow {
  id: string;
  request_id: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  context: AttachmentContext;
  created_at: string;
}

export interface StatusHistoryRow {
  id: number;
  request_id: string;
  from_status: RequestStatus | null;
  to_status: RequestStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
  actor: { name: string } | null;
}

export interface AdminCommentRow {
  id: number;
  request_id: string;
  admin_id: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
  admin: { name: string } | null;
}

export interface PaymentRow {
  id: number;
  request_id: string;
  paid_amount: number;
  paid_at: string;
  paid_by: string;
  accounting_reference: string | null;
  note: string | null;
  amount_diff_reason: string | null;
  created_at: string;
}

export interface PaymentCorrectionRow {
  id: number;
  payment_id: number;
  previous_values: Record<string, string | number | null>;
  new_values: Record<string, string | number | null>;
  reason: string;
  corrected_at: string;
  corrector: { name: string } | null;
}

export const PAYMENT_FIELD_LABEL: Record<string, string> = {
  paid_amount: "지급 금액",
  paid_at: "지급일",
  accounting_reference: "회계 처리번호",
  note: "지급 메모",
};

export type NotificationType =
  | "REQUEST_SUBMITTED"
  | "REQUEST_RESUBMITTED"
  | "REVISION_REQUESTED"
  | "REQUEST_APPROVED"
  | "REQUEST_REJECTED"
  | "PAYMENT_COMPLETED"
  | "PAYMENT_DUE_SOON"
  | "STALE_REQUEST"
  | "BUDGET_WARNING";

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  REQUEST_SUBMITTED: "신청 접수",
  REQUEST_RESUBMITTED: "재신청",
  REVISION_REQUESTED: "보완 요청",
  REQUEST_APPROVED: "승인",
  REQUEST_REJECTED: "반려",
  PAYMENT_COMPLETED: "지급 완료",
  PAYMENT_DUE_SOON: "지급 희망일 임박",
  STALE_REQUEST: "장기 미처리",
  BUDGET_WARNING: "예산 부족 예상",
};

export interface NotificationRow {
  id: number;
  user_id: string;
  request_id: string | null;
  type: NotificationType;
  message: string;
  is_read: boolean;
  created_at: string;
}

export function categoryLabel(c: EventCategory | null) {
  return c ? CATEGORY_LABEL[c] : "-";
}

export function targetSummary(r: Pick<RequestRow, "target_company" | "target_name">) {
  const parts = [r.target_company, r.target_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "-";
}
