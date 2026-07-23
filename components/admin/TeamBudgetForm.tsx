"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { allocateTeamBudgets } from "@/app/(main)/admin/budget/actions";
import Button from "@/components/ui/Button";
import Input, { Textarea } from "@/components/ui/Input";
import { formatKRW } from "@/lib/format";
import { formatAmountInput, parseAmount } from "@/lib/request-form";

export interface TeamBudgetItem {
  teamId: number;
  teamName: string;
  amount: number;
}

interface TeamBudgetFormProps {
  year: number;
  departmentId: number;
  departmentName: string;
  divisionBudget: number;
  teams: TeamBudgetItem[];
}

export default function TeamBudgetForm({
  year,
  departmentId,
  departmentName,
  divisionBudget,
  teams,
}: TeamBudgetFormProps) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<string[]>(
    teams.map((t) => t.amount.toLocaleString("ko-KR")),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = amounts.map((a) => parseAmount(a) ?? 0);
  const allocated = parsed.reduce((s, n) => s + n, 0);
  const unallocated = divisionBudget - allocated;
  const over = allocated > divisionBudget;
  const changed = parsed.some((n, i) => n !== teams[i].amount);

  function setAmount(i: number, value: string) {
    setAmounts((prev) => prev.map((a, idx) => (idx === i ? formatAmountInput(value) : a)));
  }

  function onSubmit() {
    if (over) {
      setError(`팀 배분 합계가 국 예산(${formatKRW(divisionBudget)})을 초과했습니다.`);
      return;
    }
    if (changed && !reason.trim()) {
      setError("예산 조정 사유를 입력해 주세요.");
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await allocateTeamBudgets({
        year,
        departmentId,
        allocations: teams.map((t, i) => ({ teamId: t.teamId, amount: parsed[i] })),
        reason,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setReason("");
        setNotice("팀 예산이 저장되었습니다.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {teams.map((t, i) => (
          <Input
            key={t.teamId}
            id={`team_${t.teamId}`}
            label={`${t.teamName} (원)`}
            inputMode="numeric"
            value={amounts[i]}
            onChange={(e) => setAmount(i, e.target.value)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-600">
          {departmentName} 예산:{" "}
          <span className="font-semibold text-slate-900">{formatKRW(divisionBudget)}</span>
        </span>
        <span className="text-slate-600">
          배분 합계:{" "}
          <span className={`font-semibold ${over ? "text-red-600" : "text-slate-900"}`}>
            {formatKRW(allocated)}
          </span>
        </span>
        <span className="text-slate-600">
          미배분:{" "}
          <span className={`font-semibold ${unallocated < 0 ? "text-red-600" : "text-slate-900"}`}>
            {formatKRW(unallocated)}
          </span>
        </span>
      </div>

      {changed && (
        <Textarea
          id={`team_reason_${departmentId}`}
          label="예산 조정 사유"
          requiredMark
          placeholder="팀 예산 배분 변경 사유를 입력해 주세요."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}

      {notice && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={pending || !changed || over}>
          {pending ? "저장 중..." : "팀 배분 저장"}
        </Button>
      </div>
    </div>
  );
}
