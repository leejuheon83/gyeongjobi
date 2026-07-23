import Card from "@/components/ui/Card";
import { formatKRW } from "@/lib/format";

export interface TeamBudgetOverviewRow {
  team_id: number;
  team_code: string;
  team_name: string;
  department_id: number;
  department_name: string;
  budget_amount: number;
  committed_amount: number;
  remaining_amount: number;
}

export default function TeamBudgetOverview({
  rows,
  year,
  divisionName,
}: {
  rows: TeamBudgetOverviewRow[];
  year: number;
  divisionName: string;
}) {
  if (rows.length === 0) return null;

  return (
    <Card title={`${divisionName} 팀별 예산 현황 (${year}년)`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-3 py-2.5 font-medium whitespace-nowrap text-slate-500">팀</th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-slate-500">
                배분 예산
              </th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-slate-500">
                사용 금액
              </th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-slate-500">
                잔액
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const over = r.remaining_amount < 0;
              return (
                <tr key={r.team_id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3 text-slate-700">{r.team_name}</td>
                  <td className="px-3 py-3 text-right text-slate-700">
                    {formatKRW(r.budget_amount)}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">
                    {formatKRW(r.committed_amount)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right ${over ? "font-medium text-red-600" : "text-slate-700"}`}
                  >
                    {formatKRW(r.remaining_amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        국 예산을 팀별로 배분한 현황입니다. 사용 금액은 승인·지급완료 건의 승인 금액 합계
        기준입니다.
      </p>
    </Card>
  );
}
