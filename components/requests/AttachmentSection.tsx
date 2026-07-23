"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  deleteAttachment,
  uploadAttachments,
} from "@/app/(main)/requests/attachment-actions";
import Button from "@/components/ui/Button";
import {
  ACCEPT_ATTR,
  ALLOWED_EXTENSIONS,
  fileExtension,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
} from "@/lib/attachment-config";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useEscapeKey } from "@/lib/use-escape-key";
import type { AttachmentContext, AttachmentRow } from "@/lib/types";

interface AttachmentSectionProps {
  requestId?: string;
  attachments: AttachmentRow[];
  editable: boolean;
  context?: AttachmentContext;
  uploadLabel?: string;
  // 저장 전 새 신청서에서 첫 첨부 시 draft를 만들어 id를 확보한다.
  // null 반환 시 업로드를 중단한다(예: 필수값 미입력).
  ensureRequestId?: () => Promise<string | null>;
  // 저장 전 상태에서 처음 업로드가 성공했을 때(=draft가 새로 만들어졌을 때) 호출된다.
  onDraftUploaded?: (requestId: string) => void;
}

function Thumbnail({ attachment }: { attachment: AttachmentRow }) {
  const url = `/api/attachments/${attachment.id}`;
  if (attachment.mime_type?.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={attachment.file_name}
        className="size-12 shrink-0 rounded-md border border-slate-200 object-cover"
      />
    );
  }
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-md border border-red-100 bg-red-50 text-xs font-bold text-red-600">
      PDF
    </span>
  );
}

export default function AttachmentSection({
  requestId,
  attachments,
  editable,
  context = "APPLICATION",
  uploadLabel = "청첩장, 부고 문자 등 증빙 자료를 첨부해 주세요.",
  ensureRequestId,
  onDraftUploaded,
}: AttachmentSectionProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AttachmentRow | null>(null);
  const [pending, startTransition] = useTransition();

  useEscapeKey(deleteTarget !== null && !pending, () => setDeleteTarget(null));

  function onFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = [...fileList];
    if (inputRef.current) inputRef.current.value = "";

    const localErrors: string[] = [];
    const valid: File[] = [];
    for (const file of files) {
      const ext = fileExtension(file.name);
      if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
        localErrors.push(`${file.name}: 허용되지 않는 형식입니다. (PDF, JPG, JPEG, PNG만 가능)`);
      } else if (file.size > MAX_FILE_SIZE_BYTES) {
        localErrors.push(`${file.name}: 파일이 너무 큽니다. (최대 ${MAX_FILE_SIZE_MB}MB)`);
      } else {
        valid.push(file);
      }
    }

    setNotice(null);
    if (valid.length === 0) {
      setErrors(localErrors);
      return;
    }

    const formData = new FormData();
    for (const file of valid) formData.append("files", file);

    startTransition(async () => {
      // 저장 전 새 신청서라면 먼저 draft를 만들어 id를 확보한다.
      let id = requestId;
      let createdDraft = false;
      if (!id) {
        if (!ensureRequestId) {
          setErrors([...localErrors, "먼저 신청서를 저장한 뒤 파일을 첨부할 수 있습니다."]);
          return;
        }
        const ensured = await ensureRequestId();
        if (!ensured) return; // ensureRequestId가 오류 메시지를 표시함
        id = ensured;
        createdDraft = true;
      }

      const result = await uploadAttachments(id, formData, context);
      setErrors([...localErrors, ...result.errors]);
      if (result.uploaded > 0) setNotice(`${result.uploaded}개 파일이 등록되었습니다.`);

      // draft가 새로 만들어졌다면(=저장 전 새 신청서) 편집 화면으로 이동해
      // 저장된 신청서 컨텍스트에서 이어서 작성하도록 한다. 업로드 성공 여부와 무관하게 이동한다.
      if (createdDraft && onDraftUploaded) {
        onDraftUploaded(id);
      } else if (result.uploaded > 0) {
        router.refresh();
      }
    });
  }

  function onDeleteConfirm() {
    if (!deleteTarget) return;
    const attachment = deleteTarget;
    setNotice(null);
    startTransition(async () => {
      const result = await deleteAttachment(attachment.id);
      if (result.error) {
        setErrors([result.error]);
      } else {
        setErrors([]);
        setNotice("파일이 삭제되었습니다.");
        router.refresh();
      }
      setDeleteTarget(null);
    });
  }

  return (
    <div className="space-y-3">
      {editable && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {uploadLabel}
              <span className="ml-2 text-xs text-slate-400">
                PDF·JPG·JPEG·PNG, 파일당 최대 {MAX_FILE_SIZE_MB}MB, 여러 개 선택 가능
              </span>
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
            >
              {pending ? "업로드 중..." : "파일 선택"}
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => onFilesSelected(e.target.files)}
          />
        </div>
      )}

      {notice && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      )}
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md bg-red-50 px-3 py-2">
          {errors.map((e) => (
            <li key={e} className="text-sm text-red-700">
              {e}
            </li>
          ))}
        </ul>
      )}

      {attachments.length === 0 ? (
        <p className="text-sm text-slate-400">첨부된 파일이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2"
            >
              <Thumbnail attachment={attachment} />
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/attachments/${attachment.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium text-blue-600 hover:underline"
                >
                  {attachment.file_name}
                </a>
                <p className="text-xs text-slate-400">
                  {formatBytes(attachment.size_bytes)} · {formatDateTime(attachment.created_at)}
                </p>
              </div>
              <a
                href={`/api/attachments/${attachment.id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
              >
                보기
              </a>
              {editable && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteTarget(attachment)}
                  disabled={pending}
                >
                  삭제
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="닫기"
            className="absolute inset-0 bg-black/50"
            onClick={() => !pending && setDeleteTarget(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="attachment-delete-title"
            className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 id="attachment-delete-title" className="text-base font-semibold text-slate-900">
              파일을 삭제할까요?
            </h2>
            <p className="mt-1 text-sm text-slate-500 break-all">
              &apos;{deleteTarget.file_name}&apos; 파일을 삭제합니다. 삭제한 파일은 복구할 수 없습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={pending}>
                닫기
              </Button>
              <Button variant="danger" onClick={onDeleteConfirm} disabled={pending}>
                {pending ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
