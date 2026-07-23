import BudgetForm from "@/components/admin/BudgetForm";
import TeamBudgetForm from "@/components/admin/TeamBudgetForm";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import Card, { StatCard } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import Table, { type Column } from "@/components/ui/Table";
import { formatDateTime, formatKRW } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

interface DeptUsage {
  department_id: number;
  department_code: string;
  department_name: string;
  budget_amount: number;
  committed_amount: number;
  actual_amount: number;
}

interface TeamUsage {
  team_id: number;
  team_code: string;
  team_name: string;
  department_id: number;
  department_name: string;
  budget_amount: number;
  committed_amount: number;
  actual_amount: number;
}

interface AdjustmentRow {
  id: number;
  department_id: number | null;
  previous_amount: number;
  new_amount: number;
  reason: string;
  adjusted_at: string;
  department: { name: string } | null;
  team: { name: string } | null;
  admin: { name: string } | null;
}

const usageColumns: Column<DeptUsage>[] = [
  { key: "department", header: "부서", render: (u) => u.department_name },
  {
    key: "budget",
    header: "예산",
    className: "text-right",
    render: (u) => formatKRW(u.budget_amount),
  },
  {
    key: "committed",
    header: "사용 예정액",
    className: "text-right",
    render: (u) => formatKRW(u.committed_amount),
  },
  {
    key: "actual",
    header: "실제 사용액",
    className: "text-right",
    render: (u) => formatKRW(u.actual_amount),
  },
  {
    key: "remaining",
    header: "잔액",
    className: "text-right",
    render: (u) => {
      const remaining = u.budget_amount - u.committed_amount;
      return (
        <span className={remaining < 0 ? "font-medium text-red-600" : ""}>
          {formatKRW(remaining)}
        </span>
      );
    },
  },
  {
    key: "rate",
    header: "집행률",
    render: (u) => {
      const rate = u.budget_amount > 0 ? Math.round((u.committed_amount / u.budget_amount) * 100) : 0;
      const over = u.committed_amount > u.budget_amount;
      return (
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${over ? "bg-red-500" : rate >= 80 ? "bg-amber-500" : "bg-blue-500"}`}
              style={{ width: `${Math.min(rate, 100)}%` }}
            />
          </div>
          <span className={`text-xs ${over ? "font-medium text-red-600" : "text-slate-500"}`}>
            {rate}%{over && " 초과"}
          </span>
        </div>
      );
    },
  },
];

const teamUsageColumns: Column<TeamUsage>[] = [
  { key: "team", header: "팀", render: (u) => u.team_name },
  {
    key: "budget",
    header: "배분 예산",
    className: "text-right",
    render: (u) => formatKRW(u.budget_amount),
  },
  {
    key: "committed",
    header: "사용 예정액",
    className: "text-right",
    render: (u) => formatKRW(u.committed_amount),
  },
  {
    key: "actual",
    header: "실제 사용액",
    className: "text-right",
    render: (u) => formatKRW(u.actual_amount),
  },
  {
    key: "remaining",
    header: "잔액",
    className: "text-right",
    render: (u) => {
      const remaining = u.budget_amount - u.committed_amount;
      return (
        <span className={remaining < 0 ? "font-medium text-red-600" : ""}>
          {formatKRW(remaining)}
        </span>
      );
    },
  },
];

const adjustmentColumns: Column<AdjustmentRow>[] = [
  { key: "item", header: "항목", render: (a) => a.team?.name ?? a.department?.name ?? "공통 예산" },
  {
    key: "previous",
    header: "이전 금액",
    className: "text-right",
    render: (a) => formatKRW(a.previous_amount),
  },
  {
    key: "new",
    header: "변경 금액",
    className: "text-right",
    render: (a) => formatKRW(a.new_amount),
  },
  { key: "reason", header: "조정 사유", render: (a) => a.reason },
  { key: "admin", header: "조정 담당자", render: (a) => a.admin?.name ?? "-" },
  { key: "adjusted_at", header: "조정 일시", render: (a) => formatDateTime(a.adjusted_at) },
];

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = sp.year ? Number(sp.year) : currentYear;

  const supabase = await createClient();

  const [{ data: annual }, { data: usageData }, { data: teamUsageData }, { data: yearRows }] =
    await Promise.all([
      supabase
        .from("annual_budgets")
        .select("id, total_amount, common_amount")
        .eq("year", year)
        .maybeSingle(),
      supabase.rpc("budget_summary", { p_year: year }),
      supabase.rpc("team_budget_summary", { p_year: year }),
      supabase.from("annual_budgets").select("year").order("year", { ascending: false }),
    ]);

  const usage = (usageData ?? []) as DeptUsage[];
  const teamUsage = (teamUsageData ?? []) as TeamUsage[];
  const committedTotal = usage.reduce((s, u) => s + u.committed_amount, 0);
  const actualTotal = usage.reduce((s, u) => s + u.actual_amount, 0);
  const totalBudget = annual?.total_amount ?? 0;
  const remaining = totalBudget - committedTotal;
  const overBudgetDepts = usage.filter((u) => u.committed_amount > u.budget_amount);

  const findDept = (code: string) => usage.find((u) => u.department_code === code);

  let adjustments: AdjustmentRow[] = [];
  if (annual) {
    const { data } = await supabase
      .from("budget_adjustments")
      .select("*, department:departments(name), team:teams(name), admin:users!budget_adjustments_adjusted_by_fkey(name)")
      .eq("annual_budget_id", annual.id)
      .order("adjusted_at", { ascending: false });
    adjustments = (data ?? []) as unknown as AdjustmentRow[];
  }

  const years = Array.from(
    new Set([...(yearRows ?? []).map((r) => r.year), currentYear]),
  ).sort((a, b) => b - a);

  return (
    <>
      <PageHeader
        title="예산 관리"
        description="연도별·영업국별 대외경조비 예산을 편성하고 집행 현황을 확인합니다."
        action={
          <form method="get" className="flex items-end gap-2">
            <div className="w-32">
              <Select id="year" name="year" label="기준 연도" defaultValue={String(year)}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary">
              조회
            </Button>
          </form>
        }
      />

      {(remaining < 0 || overBudgetDepts.length > 0) && (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800">예산 부족 경고</p>
          <ul className="mt-1 list-inside list-disc text-sm text-red-700">
            {remaining < 0 && <li>전체 예산을 {formatKRW(Math.abs(remaining))} 초과했습니다.</li>}
            {overBudgetDepts.map((d) => (
              <li key={d.department_id}>
                {d.department_name}: 예산을 {formatKRW(d.committed_amount - d.budget_amount)} 초과했습니다.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="연간 전체 예산" value={formatKRW(totalBudget)} sub={`${year}년 기준`} />
        <StatCard label="사용 예정액" value={formatKRW(committedTotal)} sub="승인·지급완료 합계" />
        <StatCard label="실제 사용액" value={formatKRW(actualTotal)} sub="지급완료 기준" />
        <StatCard
          label="잔액"
          value={formatKRW(remaining)}
          sub={remaining < 0 ? "예산 초과" : "사용 예정액 기준"}
        />
      </div>

      <Card title="영업국별 예산 현황" className="mt-6">
        <Table
          columns={usageColumns}
          rows={usage}
          rowKey={(u) => String(u.department_id)}
          emptyMessage="영업국 데이터가 없습니다."
        />
      </Card>

      <Card title="예산 편성 / 조정" className="mt-6">
        <BudgetForm
          year={year}
          initial={{
            sales1: findDept("SALES1")?.budget_amount ?? 0,
            sales2: findDept("SALES2")?.budget_amount ?? 0,
            sales3: findDept("SALES3")?.budget_amount ?? 0,
            common: annual?.common_amount ?? 0,
          }}
        />
      </Card>

      <Card title="국별 팀 예산 배분" className="mt-6">
        <p className="mb-4 text-sm text-slate-500">
          각 국 예산을 소속 팀에 나눠 배분합니다. 팀 배분 합계는 해당 국 예산을 초과할 수 없습니다.
        </p>
        <div className="space-y-8">
          {usage.map((dept) => {
            const teams = teamUsage.filter((t) => t.department_id === dept.department_id);
            if (teams.length === 0) return null;
            return (
              <div key={dept.department_id}>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  {dept.department_name}
                </h3>
                <Table
                  columns={teamUsageColumns}
                  rows={teams}
                  rowKey={(t) => String(t.team_id)}
                  emptyMessage="팀 데이터가 없습니다."
                />
                <div className="mt-4">
                  <TeamBudgetForm
                    year={year}
                    departmentId={dept.department_id}
                    departmentName={dept.department_name}
                    divisionBudget={dept.budget_amount}
                    teams={teams.map((t) => ({
                      teamId: t.team_id,
                      teamName: t.team_name,
                      amount: t.budget_amount,
                    }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="예산 조정 이력" className="mt-6">
        <Table
          columns={adjustmentColumns}
          rows={adjustments}
          rowKey={(a) => String(a.id)}
          emptyMessage="예산 조정 이력이 없습니다."
        />
      </Card>
    </>
  );
}
