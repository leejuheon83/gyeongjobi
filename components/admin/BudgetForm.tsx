"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateAnnualBudget } from "@/app/(main)/admin/budget/actions";
import Button from "@/components/ui/Button";
import Input, { Textarea } from "@/components/ui/Input";
import { formatKRW } from "@/lib/format";
import { formatAmountInput, parseAmount } from "@/lib/request-form";

interface BudgetFormProps {
  year: number;
  initial: { sales1: number; sales2: number; sales3: number; common: number };
}

export default function BudgetForm({ year, initial }: BudgetFormProps) {
  const router = useRouter();
  const [sales1, setSales1] = useState(initial.sales1.toLocaleString("ko-KR"));
  const [sales2, setSales2] = useState(initial.sales2.toLocaleString("ko-KR"));
  const [sales3, setSales3] = useState(initial.sales3.toLocaleString("ko-KR"));
  const [common, setCommon] = useState(initial.common.toLocaleString("ko-KR"));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const values = {
    sales1: parseAmount(sales1) ?? 0,
    sales2: parseAmount(sales2) ?? 0,
    sales3: parseAmount(sales3) ?? 0,
    common: parseAmount(common) ?? 0,
  };
  const total = values.sales1 + values.sales2 + values.sales3 + values.common;
  const changed =
    values.sales1 !== initial.sales1 ||
    values.sales2 !== initial.sales2 ||
    values.sales3 !== initial.sales3 ||
    values.common !== initial.common;

  function onSubmit() {
    if (changed && !reason.trim()) {
      setError("예산 조정 사유를 입력해 주세요.");
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await updateAnnualBudget({ year, ...values, reason });
      if (result.error) {
        setError(result.error);
      } else {
        setReason("");
        setNotice("예산이 저장되었습니다.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          id="sales1"
          label="영업1국 예산 (원)"
          inputMode="numeric"
          value={sales1}
          onChange={(e) => setSales1(formatAmountInput(e.target.value))}
        />
        <Input
          id="sales2"
          label="영업2국 예산 (원)"
          inputMode="numeric"
          value={sales2}
          onChange={(e) => setSales2(formatAmountInput(e.target.value))}
        />
        <Input
          id="sales3"
          label="광고기획국 예산 (원)"
          inputMode="numeric"
          value={sales3}
          onChange={(e) => setSales3(formatAmountInput(e.target.value))}
        />
        <Input
          id="common"
          label="공통 예산 (원)"
          inputMode="numeric"
          value={common}
          onChange={(e) => setCommon(formatAmountInput(e.target.value))}
        />
      </div>

      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
        전체 예산 (자동 합산): <span className="font-semibold text-slate-900">{formatKRW(total)}</span>
      </p>

      {changed && (
        <Textarea
          id="budget_reason"
          label="예산 조정 사유"
          requiredMark
          placeholder="예산 변경 사유를 입력해 주세요."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}

      {notice && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={pending || !changed}>
          {pending ? "저장 중..." : "저장"}
        </Button>
      </div>
    </div>
  );
}
