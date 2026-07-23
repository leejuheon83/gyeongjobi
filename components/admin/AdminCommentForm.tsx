"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addAdminComment } from "@/app/(main)/admin/review/actions";
import Button from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

export default function AdminCommentForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    if (!comment.trim()) {
      setError("내용을 입력해 주세요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addAdminComment({ requestId, comment, isInternal });
      if (result.error) {
        setError(result.error);
      } else {
        setComment("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <Textarea
        id="admin_comment"
        placeholder={
          isInternal
            ? "내부 메모를 입력해 주세요. (신청자에게 보이지 않습니다)"
            : "신청자에게 공개되는 의견을 입력해 주세요."
        }
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          내부 메모 (신청자 비공개)
        </label>
        <Button size="sm" onClick={onSubmit} disabled={pending}>
          {pending ? "등록 중..." : "등록"}
        </Button>
      </div>
    </div>
  );
}
