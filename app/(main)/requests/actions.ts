"use server";

import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { sendNewRequestEmail } from "@/lib/email";
import {
  parseAmount,
  toRequestFields,
  validateRequest,
  type RequestFormValues,
} from "@/lib/request-form";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, type EventCategory } from "@/lib/types";

export interface SaveRequestResult {
  error?: string;
  fieldErrors?: Partial<Record<keyof RequestFormValues, string>>;
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
  let inFlightNoTransition = false;

  if (id) {
    const { data: existing } = await supabase
      .from("requests")
      .select("id, status, applicant_id, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (!existing || existing.applicant_id !== profile.id) {
      return { error: "신청서를 찾을 수 없습니다." };
    }
    const editableStatuses = ["DRAFT", "SUBMITTED", "REVIEWING", "REVISION_REQUESTED", "RESUBMITTED"];
    if (!editableStatuses.includes(existing.status)) {
      return { error: "이 상태에서는 수정할 수 없습니다." };
    }
    // 동시 수정 충돌 방지: 화면을 연 이후 다른 곳(다른 탭 등)에서 먼저 저장했다면 덮어쓰지 않는다
    if (updatedAt && existing.updated_at !== updatedAt) {
      return {
        error: "다른 화면에서 먼저 저장된 내용이 있습니다. 새로고침한 뒤 다시 작성해 주세요.",
      };
    }

    // 이미 제출·검토중·재제출 상태인 건은 "제출"을 눌러도 상태 전이 없이 내용만 저장한다
    // (심사가 최종 결정되기 전까지 신청자가 계속 고칠 수 있게 하기 위함)
    inFlightNoTransition =
      mode === "submit" && ["SUBMITTED", "REVIEWING", "RESUBMITTED"].includes(existing.status);
    isResubmission = !inFlightNoTransition && existing.status === "REVISION_REQUESTED";
    const row =
      mode === "submit"
        ? inFlightNoTransition
          ? fields
          : {
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

  if (mode === "submit" && !inFlightNoTransition && requestId && requestNo) {
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
      targetSummary: [values.client_company, values.target_name].filter(Boolean).join(" / ") || "-",
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
