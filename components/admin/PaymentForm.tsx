"use client";

import { useState, useTransition } from "react";
import {
  completePayment,
  correctPayment,
} from "@/app/(main)/admin/payments/actions";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input, { Textarea } from "@/components/ui/Input";
import { formatKRW } from "@/lib/format";
import { formatAmountInput, parseAmount } from "@/lib/request-form";
import { useEscapeKey } from "@/lib/use-escape-key";

interface PaymentFormProps {
  mode: "complete" | "correct";
  requestId: string;
  requestNo: string;
  approvedAmount: number | null;
  adminName: string;
  expectedUpdatedAt?: string; // complete 모드 전용 (동시 처리 방지)
  paymentId?: number; // correct 모드 전용
  initial: {
    paidAt: string;
    paidAmount: string;
    accountingReference: string;
    note: string;
  };
}

export default function PaymentForm({
  mode,
  requestId,
  requestNo,
  approvedAmount,
  adminName,
  expectedUpdatedAt,
  paymentId,
  initial,
}: PaymentFormProps) {
  const [paidAt, setPaidAt] = useState(initial.paidAt);
  const [paidAmount, setPaidAmount] = useState(initial.paidAmount);
  const [accountingReference, setAccountingReference] = useState(initial.accountingReference);
  const [note, setNote] = useState(initial.note);
  const [reasonText, setReasonText] = useState(""); // 금액 차이 사유(complete) / 변경 사유(correct)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEscapeKey(confirmOpen && !pending, () => setConfirmOpen(false));

  const amountValue = parseAmount(paidAmount);
  const diffsFromApproved =
    mode === "complete" &&
    approvedAmount != null &&
    amountValue !== null &&
    amountValue !== approvedAmount;
  const reasonRequired = mode === "correct" || diffsFromApproved;
  const reasonLabel = mode === "correct" ? "변경 사유" : "금액 차이 사유";

  function validate(): string | null {
    if (amountValue === null || amountValue <= 0) return "실제 지급 금액을 입력해 주세요.";
    if (!paidAt) return "지급일을 입력해 주세요.";
    if (reasonRequired && !reasonText.trim()) {
      return mode === "correct"
        ? "변경 사유를 입력해 주세요."
        : "승인 금액과 실제 지급 금액이 다르면 사유를 입력해 주세요.";
    }
    return null;
  }

  function onPrimaryClick() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setConfirmOpen(true);
  }

  function onConfirm() {
    startTransition(async () => {
      const result =
        mode === "complete"
          ? await completePayment({
              requestId,
              paidAt,
              paidAmount,
              accountingReference,
              note,
              diffReason: reasonText,
              expectedUpdatedAt: expectedUpdatedAt!,
              approvedAmount,
            })
          : await correctPayment({
              paymentId: paymentId!,
              requestId,
              paidAt,
              paidAmount,
              accountingReference,
              note,
              reason: reasonText,
            });
      if (result?.error) {
        setError(result.error);
        setConfirmOpen(false);
      }
      // 성공 시 서버 액션이 리다이렉트합니다.
    });
  }

  return (
    <Card title={mode === "complete" ? "지급 정보 입력" : "지급 내역 수정"}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="paid_at"
          type="date"
          label="지급일"
          requiredMark
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
        />
        <Input
          id="paid_amount"
          label="실제 지급 금액 (원)"
          requiredMark
          inputMode="numeric"
          value={paidAmount}
          onChange={(e) => setPaidAmount(formatAmountInput(e.target.value))}
        />
        <Input id="paid_by" label="지급 담당자" value={adminName} disabled />
        <Input
          id="accounting_reference"
          label="회계 처리번호"
          placeholder="예: ACC-2026-0512"
          value={accountingReference}
          onChange={(e) => setAccountingReference(e.target.value)}
        />
      </div>

      {mode === "complete" && approvedAmount != null && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          승인 금액: <span className="font-medium text-slate-900">{formatKRW(approvedAmount)}</span>
        </p>
      )}

      <div className="mt-4">
        <Textarea
          id="note"
          label="지급 메모"
          placeholder="지급 관련 메모를 입력해 주세요."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {reasonRequired && (
        <div className="mt-4">
          <Textarea
            id="reason"
            label={reasonLabel}
            requiredMark
            placeholder={
              mode === "correct"
                ? "지급 내역을 수정하는 사유를 입력해 주세요."
                : "승인 금액과 다르게 지급하는 사유를 입력해 주세요."
            }
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
          />
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-5 flex justify-end">
        <Button onClick={onPrimaryClick} disabled={pending}>
          {mode === "complete" ? "지급 완료" : "수정 저장"}
        </Button>
      </div>

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
            aria-labelledby="payment-confirm-title"
            className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 id="payment-confirm-title" className="text-base font-semibold text-slate-900">
              {mode === "complete"
                ? `${requestNo} 신청을 지급완료 처리할까요?`
                : `${requestNo} 지급 내역을 수정할까요?`}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === "complete"
                ? "처리 후 신청 상태가 지급완료로 변경되며, 일반 사용자는 더 이상 수정할 수 없습니다."
                : "변경 사유와 함께 수정 이력이 기록됩니다."}
            </p>
            <dl className="mt-4 space-y-2 rounded-md bg-slate-50 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">지급일</dt>
                <dd className="font-medium text-slate-900">{paidAt}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">지급 금액</dt>
                <dd className="font-medium text-slate-900">{paidAmount}원</dd>
              </div>
              {accountingReference && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">회계 처리번호</dt>
                  <dd className="font-medium text-slate-900">{accountingReference}</dd>
                </div>
              )}
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
              >
                취소
              </Button>
              <Button onClick={onConfirm} disabled={pending}>
                {pending ? "처리 중..." : "확인"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
