"use server";

import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { parseAmount } from "@/lib/request-form";
import { createClient } from "@/lib/supabase/server";

export interface CompletePaymentInput {
  requestId: string;
  paidAt: string;
  paidAmount: string; // 콤마 포함 문자열
  accountingReference: string;
  note: string;
  diffReason: string;
  expectedUpdatedAt: string;
  approvedAmount: number | null;
}

export interface PaymentActionResult {
  error?: string;
}

export async function completePayment(
  input: CompletePaymentInput,
): Promise<PaymentActionResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "SUPPORT_ADMIN") {
    return { error: "관리자만 지급 처리를 할 수 있습니다." };
  }

  const paidAmount = parseAmount(input.paidAmount);
  if (paidAmount === null || paidAmount <= 0) {
    return { error: "실제 지급 금액을 입력해 주세요." };
  }
  if (!input.paidAt) {
    return { error: "지급일을 입력해 주세요." };
  }
  const diffReason = input.diffReason.trim();
  if (input.approvedAmount != null && paidAmount !== input.approvedAmount && !diffReason) {
    return { error: "승인 금액과 실제 지급 금액이 다르면 사유를 입력해 주세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_payment", {
    p_request_id: input.requestId,
    p_paid_amount: paidAmount,
    p_paid_at: input.paidAt,
    p_accounting_reference: input.accountingReference.trim() || null,
    p_note: input.note.trim() || null,
    p_diff_reason: diffReason || null,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  if (error) return { error: error.message };

  redirect(`/requests/${input.requestId}`);
}

export interface CorrectPaymentInput {
  paymentId: number;
  requestId: string;
  paidAt: string;
  paidAmount: string;
  accountingReference: string;
  note: string;
  reason: string;
}

export async function correctPayment(
  input: CorrectPaymentInput,
): Promise<PaymentActionResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "SUPPORT_ADMIN") {
    return { error: "관리자만 지급 내역을 수정할 수 있습니다." };
  }

  const paidAmount = parseAmount(input.paidAmount);
  if (paidAmount === null || paidAmount <= 0) {
    return { error: "실제 지급 금액을 입력해 주세요." };
  }
  if (!input.paidAt) {
    return { error: "지급일을 입력해 주세요." };
  }
  if (!input.reason.trim()) {
    return { error: "변경 사유를 입력해 주세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_payment", {
    p_payment_id: input.paymentId,
    p_paid_amount: paidAmount,
    p_paid_at: input.paidAt,
    p_accounting_reference: input.accountingReference.trim() || null,
    p_note: input.note.trim() || null,
    p_reason: input.reason.trim(),
  });
  if (error) return { error: error.message };

  redirect(`/requests/${input.requestId}`);
}
