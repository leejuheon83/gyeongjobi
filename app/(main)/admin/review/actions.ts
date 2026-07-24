"use server";

import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import {
  parseAmount,
  toRequestFields,
  validateRequest,
  type RequestFormValues,
} from "@/lib/request-form";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL, PAYMENT_METHOD_LABEL, type EventCategory, type PaymentMethod } from "@/lib/types";

export type ReviewAction =
  | "START_REVIEW"
  | "APPROVE"
  | "REQUEST_REVISION"
  | "REJECT"
  | "CANCEL";

export interface ProcessInput {
  requestId: string;
  action: ReviewAction;
  expectedUpdatedAt: string;
  comment?: string; // 신청자에게 공개되는 처리 의견 (보완요청·반려는 사유)
  approvedAmount?: string; // 콤마 포함 문자열
  adjustReason?: string; // 승인 금액 조정 사유
  requestedAmount?: number | null;
}

export async function processRequest(input: ProcessInput): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile || profile.role !== "SUPPORT_ADMIN") {
    return { error: "관리자만 처리할 수 있습니다." };
  }

  const comment = input.comment?.trim() ?? "";
  let note = comment;
  let approvedAmount: number | null = null;

  if (input.action === "APPROVE") {
    approvedAmount = parseAmount(input.approvedAmount ?? "");
    if (approvedAmount === null || approvedAmount <= 0) {
      return { error: "승인 금액을 입력해 주세요." };
    }
    if (input.requestedAmount != null && approvedAmount > input.requestedAmount) {
      return { error: "승인 금액은 신청 금액을 초과할 수 없습니다." };
    }
    const adjusted =
      input.requestedAmount != null && approvedAmount !== input.requestedAmount;
    const adjustReason = input.adjustReason?.trim() ?? "";
    if (adjusted && !adjustReason) {
      return { error: "승인 금액이 신청 금액과 다르면 조정 사유를 입력해 주세요." };
    }
    if (adjusted) {
      note = `[금액 조정] ${adjustReason}${comment ? `\n${comment}` : ""}`;
    }
  }

  if (input.action === "REQUEST_REVISION" && !comment) {
    return { error: "보완 요청 내용을 입력해 주세요." };
  }
  if (input.action === "REJECT" && !comment) {
    return { error: "반려 사유를 입력해 주세요." };
  }
  if (input.action === "CANCEL" && !comment) {
    return { error: "취소 사유를 입력해 주세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("process_request", {
    p_request_id: input.requestId,
    p_action: input.action,
    p_note: note || null,
    p_approved_amount: approvedAmount,
    p_expected_updated_at: input.expectedUpdatedAt,
  });

  if (error) {
    return { error: error.message };
  }
  return {};
}

const FIELD_LABELS: Record<string, string> = {
  team_id: "신청 팀",
  category: "경조 구분",
  target_name: "대상자명",
  target_company: "대상자 회사/기관",
  target_position: "대상자 직위",
  relationship: "신청자와의 관계",
  client_company: "거래처명",
  sales_rep_name: "담당 영업사원",
  occurrence_date: "경조 발생일",
  event_date: "행사일",
  location: "장소",
  reason: "신청 사유",
  business_relevance: "업무 연관성",
  requested_amount: "신청 금액",
  payment_method: "지급 형태",
  desired_payment_date: "지급 희망일",
  special_request: "요청사항",
};

function displayValue(key: string, raw: unknown, teamName: string): string {
  if (key === "team_id") return teamName;
  if (key === "category") return raw ? CATEGORY_LABEL[raw as EventCategory] : "-";
  if (key === "payment_method") return raw ? PAYMENT_METHOD_LABEL[raw as PaymentMethod] : "-";
  if (key === "requested_amount") return raw != null ? `${Number(raw).toLocaleString("ko-KR")}원` : "-";
  return raw ? String(raw) : "-";
}

export interface AdminUpdateInput {
  requestId: string;
  expectedUpdatedAt: string;
  values: RequestFormValues;
  editReason: string;
}

export interface AdminUpdateResult {
  error?: string;
  fieldErrors?: Partial<Record<keyof RequestFormValues, string>>;
}

// 관리자가 신청 내용을 직접 수정한다 (모든 상태 허용, 지급완료 건 포함).
// 상태는 바뀌지 않으므로 상태 이력에는 남지 않고, 대신 관리자 메모(내부용)에
// 변경 사유와 변경 내역을 남겨 감사 추적을 유지한다.
export async function updateRequestByAdmin(input: AdminUpdateInput): Promise<AdminUpdateResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "SUPPORT_ADMIN") {
    return { error: "관리자만 수정할 수 있습니다." };
  }

  const editReason = input.editReason.trim();
  if (!editReason) {
    return { error: "수정 사유를 입력해 주세요." };
  }

  const fieldErrors = validateRequest(input.values, "submit");
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("requests")
    .select("*, team:teams(name)")
    .eq("id", input.requestId)
    .maybeSingle();
  if (!existing) return { error: "신청서를 찾을 수 없습니다." };
  if (existing.updated_at !== input.expectedUpdatedAt) {
    return {
      error: "다른 화면에서 먼저 저장된 내용이 있습니다. 새로고침한 뒤 다시 시도해 주세요.",
    };
  }

  const fields = toRequestFields(input.values) as Record<string, unknown>;
  const existingRow = existing as unknown as Record<string, unknown>;

  let oldTeamName = (existing.team as { name?: string } | null)?.name ?? "-";
  let newTeamName = oldTeamName;
  if (fields.team_id !== existingRow.team_id) {
    if (fields.team_id) {
      const { data: newTeam } = await supabase
        .from("teams")
        .select("name")
        .eq("id", fields.team_id as number)
        .maybeSingle();
      newTeamName = newTeam?.name ?? "-";
    } else {
      newTeamName = "-";
    }
  }

  const changes: string[] = [];
  for (const key of Object.keys(FIELD_LABELS)) {
    if (fields[key] === existingRow[key]) continue;
    const oldDisplay = displayValue(key, existingRow[key], oldTeamName);
    const newDisplay = displayValue(key, fields[key], newTeamName);
    if (oldDisplay === newDisplay) continue;
    changes.push(`${FIELD_LABELS[key]}: ${oldDisplay} → ${newDisplay}`);
  }

  if (changes.length === 0) {
    return { error: "변경된 내용이 없습니다." };
  }

  const { error: updateError } = await supabase.rpc("admin_update_request_content", {
    p_request_id: input.requestId,
    p_team_id: fields.team_id,
    p_category: fields.category,
    p_target_name: fields.target_name,
    p_target_company: fields.target_company,
    p_target_position: fields.target_position,
    p_relationship: fields.relationship,
    p_client_company: fields.client_company,
    p_sales_rep_name: fields.sales_rep_name,
    p_occurrence_date: fields.occurrence_date,
    p_event_date: fields.event_date,
    p_location: fields.location,
    p_reason: fields.reason,
    p_business_relevance: fields.business_relevance,
    p_requested_amount: fields.requested_amount,
    p_payment_method: fields.payment_method,
    p_desired_payment_date: fields.desired_payment_date,
    p_special_request: fields.special_request,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  if (updateError) {
    console.error("updateRequestByAdmin failed:", updateError);
    return { error: updateError.message || "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const { error: commentError } = await supabase.from("admin_comments").insert({
    request_id: input.requestId,
    admin_id: profile.id,
    comment: `[신청 내용 수정] 사유: ${editReason}\n${changes.join("\n")}`,
    is_internal: true,
  });
  if (commentError) {
    console.error("updateRequestByAdmin comment failed:", commentError);
  }

  redirect(`/admin/review/${input.requestId}`);
}

// 관리자 완전 삭제 (DB에서 영구 제거). 지급완료 건은 admin_delete_request() 안에서
// 차단된다. 삭제해도 request_deletion_log에 사유·스냅샷이 남는다.
export async function deleteRequestByAdmin(input: {
  requestId: string;
  reason: string;
}): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile || profile.role !== "SUPPORT_ADMIN") {
    return { error: "관리자만 삭제할 수 있습니다." };
  }
  const reason = input.reason.trim();
  if (!reason) return { error: "삭제 사유를 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_request", {
    p_request_id: input.requestId,
    p_reason: reason,
  });
  if (error) {
    return { error: error.message || "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  redirect("/admin/review");
}

export async function addAdminComment(input: {
  requestId: string;
  comment: string;
  isInternal: boolean;
}): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile || profile.role !== "SUPPORT_ADMIN") {
    return { error: "관리자만 작성할 수 있습니다." };
  }
  const comment = input.comment.trim();
  if (!comment) return { error: "내용을 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("admin_comments").insert({
    request_id: input.requestId,
    admin_id: profile.id,
    comment,
    is_internal: input.isInternal,
  });
  if (error) {
    console.error("addAdminComment failed:", error);
    return { error: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return {};
}
