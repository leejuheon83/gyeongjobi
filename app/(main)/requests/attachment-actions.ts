"use server";

import { randomUUID } from "node:crypto";
import { getProfile } from "@/lib/auth";
import {
  ALLOWED_EXTENSIONS,
  EXTENSION_MIME,
  fileExtension,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
} from "@/lib/attachment-config";
import { createClient } from "@/lib/supabase/server";
import type { AttachmentContext } from "@/lib/types";

const APPLICATION_EDITABLE_STATUSES = ["DRAFT", "REVISION_REQUESTED"];
const PAYMENT_EDITABLE_STATUSES = ["APPROVED", "PAID"];

// 매직 바이트로 실제 파일 형식 판별 (허용 목록 방식이라 실행 파일 등은 모두 차단)
function detectMime(buf: Buffer): string | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

export interface UploadResult {
  uploaded: number;
  errors: string[];
}

export async function uploadAttachments(
  requestId: string,
  formData: FormData,
  context: AttachmentContext = "APPLICATION",
): Promise<UploadResult> {
  const profile = await getProfile();
  if (!profile) return { uploaded: 0, errors: ["로그인이 필요합니다."] };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("requests")
    .select("id, applicant_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { uploaded: 0, errors: ["신청서를 찾을 수 없습니다."] };

  if (context === "APPLICATION") {
    if (request.applicant_id !== profile.id) {
      return { uploaded: 0, errors: ["신청서를 찾을 수 없습니다."] };
    }
    if (!APPLICATION_EDITABLE_STATUSES.includes(request.status)) {
      return {
        uploaded: 0,
        errors: ["임시저장 또는 보완요청 상태에서만 파일을 첨부할 수 있습니다."],
      };
    }
  } else {
    if (profile.role !== "SUPPORT_ADMIN") {
      return { uploaded: 0, errors: ["지급 증빙 첨부는 관리자만 등록할 수 있습니다."] };
    }
    if (!PAYMENT_EDITABLE_STATUSES.includes(request.status)) {
      return { uploaded: 0, errors: ["승인 또는 지급완료 상태에서만 지급 증빙을 첨부할 수 있습니다."] };
    }
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { uploaded: 0, errors: ["업로드할 파일이 없습니다."] };

  let uploaded = 0;
  const errors: string[] = [];

  for (const file of files) {
    const ext = fileExtension(file.name);
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
      errors.push(`${file.name}: 허용되지 않는 형식입니다. (PDF, JPG, JPEG, PNG만 가능)`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push(`${file.name}: 파일이 너무 큽니다. (최대 ${MAX_FILE_SIZE_MB}MB)`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`${file.name}: 빈 파일은 업로드할 수 없습니다.`);
      continue;
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const detected = detectMime(buf);
    if (!detected || detected !== EXTENSION_MIME[ext]) {
      errors.push(`${file.name}: 실제 파일 내용이 확장자와 다르거나 허용되지 않는 형식입니다.`);
      continue;
    }

    const storagePath =
      context === "PAYMENT"
        ? `${requestId}/payment/${randomUUID()}.${ext}`
        : `${requestId}/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(storagePath, buf, { contentType: detected });
    if (uploadError) {
      console.error("attachment upload failed:", uploadError);
      errors.push(`${file.name}: 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.`);
      continue;
    }

    const { error: insertError } = await supabase.from("attachments").insert({
      request_id: requestId,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: detected,
      size_bytes: file.size,
      uploaded_by: profile.id,
      context,
    });
    if (insertError) {
      console.error("attachment metadata insert failed:", insertError);
      await supabase.storage.from("attachments").remove([storagePath]);
      errors.push(`${file.name}: 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.`);
      continue;
    }

    uploaded += 1;
  }

  return { uploaded, errors };
}

export async function deleteAttachment(
  attachmentId: string,
): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "로그인이 필요합니다." };

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("attachments")
    .select("id, storage_path, storage_bucket")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!attachment) return { error: "파일을 찾을 수 없습니다." };

  // RLS가 본인 신청서 + 수정 가능 상태만 삭제 허용
  const { data: deleted, error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", attachmentId)
    .select("id");
  if (error) {
    console.error("attachment delete failed:", error);
    return { error: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (!deleted || deleted.length === 0) {
    return { error: "이 상태에서는 파일을 삭제할 수 없습니다." };
  }

  await supabase.storage
    .from(attachment.storage_bucket)
    .remove([attachment.storage_path]);

  return {};
}
