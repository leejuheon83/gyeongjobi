"use server";

import { getProfile } from "@/lib/auth";
import { parseAmount } from "@/lib/request-form";
import { createClient } from "@/lib/supabase/server";

export type ReviewAction = "START_REVIEW" | "APPROVE" | "REQUEST_REVISION" | "REJECT";

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
