"use client";

import { useState, useTransition } from "react";
import { deleteRequestByAdmin } from "@/app/(main)/admin/review/actions";
import Button from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { useEscapeKey } from "@/lib/use-escape-key";

interface AdminDeleteRequestButtonProps {
  requestId: string;
  requestNo: string;
}

export default function AdminDeleteRequestButton({
  requestId,
  requestNo,
}: AdminDeleteRequestButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEscapeKey(open && !pending, () => setOpen(false));

  const canDelete = reason.trim().length > 0 && confirmText.trim() === requestNo;

  function close() {
    setOpen(false);
    setReason("");
    setConfirmText("");
    setError(null);
  }

  function run() {
    if (!canDelete) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteRequestByAdmin({ requestId, reason });
      // 성공 시 서버 액션이 리다이렉트하므로 여기 도달하면 오류
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50/50 p-4">
      <p className="text-sm font-semibold text-red-800">위험 구역</p>
      <p className="mt-1 text-sm text-red-700">
        신청서를 DB에서 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다(취소 처리와 다릅니다).
      </p>
      <Button variant="danger" className="mt-3" onClick={() => setOpen(true)}>
        완전 삭제
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="닫기"
            className="absolute inset-0 bg-black/50"
            onClick={() => !pending && close()}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-delete-confirm-title"
            className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 id="admin-delete-confirm-title" className="text-base font-semibold text-slate-900">
              {requestNo}을(를) 완전히 삭제할까요?
            </h2>
            <p className="mt-1 text-sm text-red-700">
              신청서·첨부파일·처리 이력이 모두 사라지며 복구할 수 없습니다. (삭제 사유·기록은
              별도 삭제 로그에 남습니다)
            </p>

            <div className="mt-4 space-y-4">
              <Textarea
                id="delete_reason"
                label="삭제 사유"
                requiredMark
                placeholder="예: 중복 등록, 테스트 데이터 등"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div>
                <label htmlFor="delete_confirm" className="block text-sm font-medium text-slate-700">
                  확인을 위해 신청번호 <span className="font-semibold">{requestNo}</span>를
                  입력해 주세요
                </label>
                <input
                  id="delete_confirm"
                  className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-red-500 focus:ring-2 focus:ring-red-100 focus:outline-none"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={pending}>
                취소
              </Button>
              <Button variant="danger" onClick={run} disabled={pending || !canDelete}>
                {pending ? "삭제 중..." : "완전 삭제"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
