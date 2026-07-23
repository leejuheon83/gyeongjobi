"use server";

import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { sendNewRequestEmail } from "@/lib/email";
import {
  parseAmount,
  validateRequest,
  type RequestFormValues,
} from "@/lib/request-form";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, type EventCategory } from "@/lib/types";

export interface SaveRequestResult {
  error?: string;
  fieldErrors?: Partial<Record<keyof RequestFormValues, string>>;
}

function toRequestFields(values: RequestFormValues) {
  const t = (s: string) => (s.trim() ? s.trim() : null);
  return {
    team_id: values.team_id.trim() ? Number(values.team_id) : null,
    category: t(values.category),
    target_name: t(values.target_name),
    target_company: t(values.target_company),
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

// 작성 중 첨부파일을 바로 올릴 수 있도록, 리다이렉트 없이 임시저장 draft를 만들고 id를 돌려준다.
export async function createDraftForAttachment(
  values: RequestFormValues,
): Promise<{ id?: string; error?: string; fieldErrors?: SaveRequestResult["fieldErrors"] }> {
  const profile = await getProfile();
  if (!profile) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  if (profile.role !== "SALES_USER") {
    return { error: "대외경조비 신청은 영업국 사용자만 할 수 있습니다." };
  }

  const fieldErrors = validateRequest(values, "draft");
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .insert({
      ...toRequestFields(values),
      applicant_id: profile.id,
      department_id: profile.departmentId,
      status: "DRAFT" as const,
    })
    .select("id")
    .single();
  if (error) {
    console.error("createDraftForAttachment failed:", error);
    return { error: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return { id: data.id };
}

export async function saveRequest(input: {
  mode: "draft" | "submit";
  id?: string;
  updatedAt?: string;
  values: RequestFormValues;
}): Promise<SaveRequestResult> {
  const { mode, id, updatedAt, values } = input;

  const profile = await getProfile();
  if (!profile) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  if (profile.role !== "SALES_USER") {
    return { error: "대외경조비 신청은 영업국 사용자만 할 수 있습니다." };
  }

  const fieldErrors = validateRequest(values, mode);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const fields = toRequestFields(values);

  const supabase = await createClient();
  let requestId = id;
  let requestNo: string | undefined;
  let isResubmission = false;

  if (id) {
    const { data: existing } = await supabase
      .from("requests")
      .select("id, status, applicant_id, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (!existing || existing.applicant_id !== profile.id) {
      return { error: "신청서를 찾을 수 없습니다." };
    }
    if (!["DRAFT", "REVISION_REQUESTED"].includes(existing.status)) {
      return { error: "이 상태에서는 수정할 수 없습니다." };
    }
    // 동시 수정 충돌 방지: 화면을 연 이후 다른 곳(다른 탭 등)에서 먼저 저장했다면 덮어쓰지 않는다
    if (updatedAt && existing.updated_at !== updatedAt) {
      return {
        error: "다른 화면에서 먼저 저장된 내용이 있습니다. 새로고침한 뒤 다시 작성해 주세요.",
      };
    }

    // 임시저장(내용만 저장)은 상태 유지, 제출은 상태에 따라 SUBMITTED/RESUBMITTED로 전이
    isResubmission = existing.status === "REVISION_REQUESTED";
    const row =
      mode === "submit"
        ? {
            ...fields,
            status: isResubmission ? ("RESUBMITTED" as const) : ("SUBMITTED" as const),
          }
        : fields;

    let query = supabase.from("requests").update(row).eq("id", id).eq("applicant_id", profile.id);
    if (updatedAt) query = query.eq("updated_at", updatedAt);
    const { data, error } = await query.select("id, request_no");
    if (error) {
      console.error("saveRequest update failed:", error);
      return { error: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }
    if (!data || data.length === 0) {
      return {
        error: updatedAt
          ? "다른 화면에서 먼저 저장된 내용이 있습니다. 새로고침한 뒤 다시 작성해 주세요."
          : "수정할 수 없는 신청서입니다. 상태를 확인해 주세요.",
      };
    }
    requestNo = data[0].request_no;
  } else {
    const { data, error } = await supabase
      .from("requests")
      .insert({
        ...fields,
        applicant_id: profile.id,
        department_id: profile.departmentId,
        status: mode === "draft" ? ("DRAFT" as const) : ("SUBMITTED" as const),
      })
      .select("id, request_no")
      .single();
    if (error) {
      console.error("saveRequest insert failed:", error);
      return { error: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }
    requestId = data.id;
    requestNo = data.request_no;
  }

  if (mode === "submit" && requestId && requestNo) {
    const { data: admins } = await supabase
      .from("users")
      .select("email")
      .eq("role", "SUPPORT_ADMIN")
      .eq("is_active", true);
    await sendNewRequestEmail({
      adminEmails: (admins ?? []).map((a) => a.email),
      requestId,
      requestNo,
      isResubmission,
      applicantName: profile.name,
      departmentName: profile.departmentName,
      targetSummary: [values.target_company, values.target_name].filter(Boolean).join(" / ") || "-",
      categoryLabel: categoryLabel(values.category as EventCategory),
      amount: parseAmount(values.amount),
    });
  }

  if (mode === "submit") {
    redirect(`/requests/${requestId}`);
  }
  redirect(`/requests/${requestId}/edit?saved=1`);
}

export async function cancelRequest(id: string): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "로그인이 필요합니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .update({ status: "CANCELLED" })
    .eq("id", id)
    .eq("applicant_id", profile.id)
    .select("id");
  if (error) {
    console.error("cancelRequest failed:", error);
    return { error: "취소하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (!data || data.length === 0) {
    return { error: "취소할 수 없는 신청서입니다. 상태를 확인해 주세요." };
  }
  return {};
}
