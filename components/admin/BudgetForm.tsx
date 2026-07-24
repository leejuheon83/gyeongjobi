"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateAnnualBudget } from "@/app/(main)/admin/budget/actions";
import Button from "@/components/ui/Button";
import Input, { Textarea } from "@/components/ui/Input";
import { formatKRW } from "@/lib/format";
import { formatAmountInput, parseAmount } from "@/lib/request-form";

export interface BudgetDept {
  id: number;
  name: string;
  amount: number;
}

interface BudgetFormProps {
  year: number;
  departments: BudgetDept[];
  common: number;
}

export default function BudgetForm({ year, departments, common: initialCommon }: BudgetFormProps) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(departments.map((d) => [d.id, d.amount.toLocaleString("ko-KR")])),
  );
  const [common, setCommon] = useState(initialCommon.toLocaleString("ko-KR"));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsedCommon = parseAmount(common) ?? 0;
  const allocations = departments.map((d) => ({
    departmentId: d.id,
    amount: parseAmount(amounts[d.id] ?? "") ?? 0,
    initial: d.amount,
  }));
  const total = allocations.reduce((s, a) => s + a.amount, 0) + parsedCommon;
  const changed =
    parsedCommon !== initialCommon ||
    allocations.some((a) => a.amount !== a.initial);

  function onSubmit() {
    if (changed && !reason.trim()) {
      setError("예산 조정 사유를 입력해 주세요.");
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await updateAnnualBudget({
        year,
        allocations: allocations.map((a) => ({ departmentId: a.departmentId, amount: a.amount })),
        common: parsedCommon,
        reason,
      });
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
        {departments.map((d) => (
          <Input
            key={d.id}
            id={`dept_${d.id}`}
            label={`${d.name} 예산 (원)`}
            inputMode="numeric"
            value={amounts[d.id] ?? ""}
            onChange={(e) =>
              setAmounts((prev) => ({ ...prev, [d.id]: formatAmountInput(e.target.value) }))
            }
          />
        ))}
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
