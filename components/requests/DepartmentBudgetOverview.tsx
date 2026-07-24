import Card from "@/components/ui/Card";
import { formatKRW } from "@/lib/format";

export interface DepartmentBudgetOverviewRow {
  department_id: number;
  department_code: string;
  department_name: string;
  budget_amount: number;
  committed_amount: number;
  remaining_amount: number;
}

export default function DepartmentBudgetOverview({
  rows,
  year,
  myDepartmentId,
}: {
  rows: DepartmentBudgetOverviewRow[];
  year: number;
  myDepartmentId?: number;
}) {
  const title =
    rows.length === 1 ? `${rows[0].department_name} 예산 현황 (${year}년)` : `영업국별 예산 현황 (${year}년)`;

  return (
    <Card title={title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-3 py-2.5 font-medium whitespace-nowrap text-slate-500">
                영업국
              </th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-slate-500">
                예산
              </th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-slate-500">
                사용 금액
              </th>
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-slate-500">
                잔액
              </th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap text-slate-500">
                집행률
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isMine = r.department_id === myDepartmentId;
              const over = r.remaining_amount < 0;
              const rate =
                r.budget_amount > 0
                  ? Math.round((r.committed_amount / r.budget_amount) * 100)
                  : 0;
              return (
                <tr
                  key={r.department_id}
                  className={`border-b border-slate-100 last:border-0 ${isMine ? "bg-brand-sky/10" : ""}`}
                >
                  <td className="px-3 py-3 text-slate-700">
                    {r.department_name}
                    {isMine && rows.length > 1 && (
                      <span className="ml-1.5 rounded-full bg-brand-sky/20 px-1.5 py-0.5 text-xs font-medium text-brand-navy">
                        내 소속
                      </span>
                    )}
                  </td>
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
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${over ? "bg-red-500" : rate >= 80 ? "bg-amber-500" : "bg-brand-sky"}`}
                          style={{ width: `${Math.min(rate, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs ${over ? "font-medium text-red-600" : "text-slate-500"}`}>
                        {rate}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        사용 금액은 승인·지급완료 건의 승인 금액 합계 기준이며, 실제 처리 결과에 따라 달라질 수
        있습니다.
      </p>
    </Card>
  );
}
