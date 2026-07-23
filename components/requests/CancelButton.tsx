"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelRequest } from "@/app/(main)/requests/actions";
import Button from "@/components/ui/Button";
import { useEscapeKey } from "@/lib/use-escape-key";

export default function CancelButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEscapeKey(confirmOpen && !pending, () => setConfirmOpen(false));

  function onConfirm() {
    startTransition(async () => {
      const result = await cancelRequest(requestId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        disabled={pending}
      >
        신청 취소
      </Button>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="닫기"
            className="absolute inset-0 bg-black/50"
            onClick={() => !pending && setConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-confirm-title"
            className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 id="cancel-confirm-title" className="text-base font-semibold text-slate-900">
              신청을 취소할까요?
            </h2>
            <p className="mt-1 text-sm text-slate-500">취소한 신청은 되돌릴 수 없습니다.</p>

            {error && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={pending}>
                닫기
              </Button>
              <Button variant="danger" onClick={onConfirm} disabled={pending}>
                {pending ? "취소 중..." : "신청 취소"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
