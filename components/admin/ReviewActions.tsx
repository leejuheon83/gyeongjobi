"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  processRequest,
  type ReviewAction,
} from "@/app/(main)/admin/review/actions";
import Button from "@/components/ui/Button";
import Input, { Textarea } from "@/components/ui/Input";
import { formatAmountInput, parseAmount } from "@/lib/request-form";
import { formatKRW } from "@/lib/format";
import { useEscapeKey } from "@/lib/use-escape-key";
import type { RequestStatus } from "@/lib/types";

interface ReviewActionsProps {
  requestId: string;
  status: RequestStatus;
  requestedAmount: number | null;
  expectedUpdatedAt: string;
}

const ACTION_META: Record<
  ReviewAction,
  { label: string; title: string; confirmLabel: string; variant: "primary" | "secondary" | "danger" }
> = {
  START_REVIEW: {
    label: "검토 시작",
    title: "이 신청서의 검토를 시작할까요?",
    confirmLabel: "검토 시작",
    variant: "secondary",
  },
  APPROVE: {
    label: "승인",
    title: "이 신청서를 승인할까요?",
    confirmLabel: "승인",
    variant: "primary",
  },
  REQUEST_REVISION: {
    label: "보완 요청",
    title: "신청자에게 보완을 요청할까요?",
    confirmLabel: "보완 요청",
    variant: "secondary",
  },
  REJECT: {
    label: "반려",
    title: "이 신청서를 반려할까요?",
    confirmLabel: "반려",
    variant: "danger",
  },
  CANCEL: {
    label: "신청 취소",
    title: "이 신청서를 취소할까요?",
    confirmLabel: "취소 처리",
    variant: "danger",
  },
};

export default function ReviewActions({
  requestId,
  status,
  requestedAmount,
  expectedUpdatedAt,
}: ReviewActionsProps) {
  const router = useRouter();
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [comment, setComment] = useState("");
  const [approvedAmount, setApprovedAmount] = useState(
    requestedAmount != null ? requestedAmount.toLocaleString("ko-KR") : "",
  );
  const [adjustReason, setAdjustReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEscapeKey(action !== null && !pending, () => setAction(null));

  const available: ReviewAction[] =
    status === "SUBMITTED" || status === "RESUBMITTED"
      ? ["START_REVIEW"]
      : status === "REVIEWING"
        ? ["APPROVE", "REQUEST_REVISION", "REJECT"]
        : [];

  // 취소는 이미 취소된 건을 제외한 모든 상태에서 가능 (지급완료 건 포함)
  const canCancel = status !== "CANCELLED";

  function open(a: ReviewAction) {
    setError(null);
    setComment("");
    setAdjustReason("");
    setApprovedAmount(requestedAmount != null ? requestedAmount.toLocaleString("ko-KR") : "");
    setAction(a);
  }

  function validate(a: ReviewAction): string | null {
    if (a === "APPROVE") {
      const amount = parseAmount(approvedAmount);
      if (amount === null || amount <= 0) return "승인 금액을 입력해 주세요.";
      if (requestedAmount != null && amount > requestedAmount) {
        return "승인 금액은 신청 금액을 초과할 수 없습니다.";
      }
      if (requestedAmount != null && amount !== requestedAmount && !adjustReason.trim()) {
        return "승인 금액이 신청 금액과 다르면 조정 사유를 입력해 주세요.";
      }
    }
    if (a === "REQUEST_REVISION" && !comment.trim()) return "보완 요청 내용을 입력해 주세요.";
    if (a === "REJECT" && !comment.trim()) return "반려 사유를 입력해 주세요.";
    if (a === "CANCEL" && !comment.trim()) return "취소 사유를 입력해 주세요.";
    return null;
  }

  function run(a: ReviewAction) {
    const validationError = validate(a);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await processRequest({
        requestId,
        action: a,
        expectedUpdatedAt,
        comment,
        approvedAmount,
        adjustReason,
        requestedAmount,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setAction(null);
        router.refresh();
      }
    });
  }

  const isAdjusted =
    action === "APPROVE" &&
    requestedAmount != null &&
    parseAmount(approvedAmount) !== null &&
    parseAmount(approvedAmount) !== requestedAmount;

  return (
    <>
      {available.length === 0 && !canCancel && (
        <p className="text-sm text-slate-500">
          현재 상태에서는 처리할 수 있는 작업이 없습니다.
        </p>
      )}

      {available.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {available.map((a) => (
            <Button
              key={a}
              variant={ACTION_META[a].variant}
              onClick={() => open(a)}
              disabled={pending}
            >
              {ACTION_META[a].label}
            </Button>
          ))}
        </div>
      )}
      {(status === "SUBMITTED" || status === "RESUBMITTED") && (
        <p className="mt-2 text-xs text-slate-400">
          승인·보완 요청·반려는 검토 시작 후 진행할 수 있습니다.
        </p>
      )}

      {canCancel && (
        <div className={available.length > 0 ? "mt-4 border-t border-slate-100 pt-4" : ""}>
          <Button variant="secondary" onClick={() => open("CANCEL")} disabled={pending}>
            신청 취소
          </Button>
          <p className="mt-2 text-xs text-slate-400">
            신청서를 취소 상태로 변경합니다. 이력은 남고 되돌릴 수 있습니다.
            {status === "PAID" && " 지급완료 건을 취소하면 예산 실제사용액에서도 제외됩니다."}
          </p>
        </div>
      )}

      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="닫기"
            className="absolute inset-0 bg-black/50"
            onClick={() => !pending && setAction(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-confirm-title"
            className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 id="review-confirm-title" className="text-base font-semibold text-slate-900">
              {ACTION_META[action].title}
            </h2>

            <div className="mt-4 space-y-4">
              {action === "APPROVE" && (
                <>
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    신청 금액:{" "}
                    <span className="font-medium text-slate-900">
                      {requestedAmount != null ? formatKRW(requestedAmount) : "-"}
                    </span>
                  </p>
                  <Input
                    id="approved_amount"
                    label="승인 금액 (원)"
                    requiredMark
                    inputMode="numeric"
                    value={approvedAmount}
                    onChange={(e) => setApprovedAmount(formatAmountInput(e.target.value))}
                  />
                  {isAdjusted && (
                    <Textarea
                      id="adjust_reason"
                      label="조정 사유"
                      requiredMark
                      placeholder="승인 금액이 신청 금액과 다른 사유를 입력해 주세요."
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                    />
                  )}
                  <Textarea
                    id="comment"
                    label="처리 의견 (선택, 신청자에게 공개)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </>
              )}

              {action === "REQUEST_REVISION" && (
                <Textarea
                  id="comment"
                  label="보완 요청 내용 (신청자에게 공개)"
                  requiredMark
                  placeholder="보완이 필요한 내용을 구체적으로 입력해 주세요."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              )}

              {action === "REJECT" && (
                <Textarea
                  id="comment"
                  label="반려 사유 (신청자에게 공개)"
                  requiredMark
                  placeholder="반려 사유를 입력해 주세요."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              )}

              {action === "START_REVIEW" && (
                <p className="text-sm text-slate-500">
                  검토중 상태로 변경되며, 이후 승인·보완 요청·반려를 진행할 수 있습니다.
                </p>
              )}

              {action === "CANCEL" && (
                <>
                  {status === "PAID" && (
                    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      이미 지급완료된 신청서입니다. 취소하면 예산 실제사용액 집계에서
                      제외됩니다.
                    </p>
                  )}
                  <Textarea
                    id="comment"
                    label="취소 사유"
                    requiredMark
                    placeholder="취소 사유를 입력해 주세요. (처리 이력에 기록됩니다)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </>
              )}

              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setAction(null)}
                disabled={pending}
              >
                취소
              </Button>
              <Button
                variant={ACTION_META[action].variant}
                onClick={() => run(action)}
                disabled={pending}
              >
                {pending ? "처리 중..." : ACTION_META[action].confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
