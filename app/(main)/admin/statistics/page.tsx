import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import Card, { StatCard } from "@/components/ui/Card";
import Input, { Select } from "@/components/ui/Input";
import Table, { type Column } from "@/components/ui/Table";
import { formatDateTime, formatKRW } from "@/lib/format";
import {
  averageProcessingDays,
  byCategory,
  byClient,
  byDepartment,
  monthlyBreakdown,
  statusCounts,
  sumApproved,
  sumPaid,
  sumRequested,
  type ClientStat,
  type GroupStat,
  type MonthlyStat,
  type ReportFilters,
} from "@/lib/report";
import { fetchReportRows } from "@/lib/report-query";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL, STATUS_LABEL } from "@/lib/types";

interface DownloadHistoryRow {
  id: number;
  row_count: number;
  downloaded_at: string;
  admin: { name: string } | null;
}

const monthlyColumns: Column<MonthlyStat>[] = [
  { key: "month", header: "연월", render: (m) => m.month },
  { key: "requested", header: "신청 금액", className: "text-right", render: (m) => formatKRW(m.requested) },
  { key: "approved", header: "승인 금액", className: "text-right", render: (m) => formatKRW(m.approved) },
  { key: "paid", header: "지급 금액", className: "text-right", render: (m) => formatKRW(m.paid) },
];

const groupColumns = (labelHeader: string): Column<GroupStat>[] => [
  { key: "label", header: labelHeader, render: (g) => g.label },
  { key: "count", header: "건수", className: "text-right", render: (g) => `${g.count}건` },
  { key: "requested", header: "신청 금액", className: "text-right", render: (g) => formatKRW(g.requested) },
  { key: "approved", header: "승인 금액", className: "text-right", render: (g) => formatKRW(g.approved) },
  { key: "paid", header: "지급 금액", className: "text-right", render: (g) => formatKRW(g.paid) },
];

const clientColumns: Column<ClientStat>[] = [
  { key: "client", header: "거래처", render: (c) => c.client },
  { key: "count", header: "지급 건수", className: "text-right", render: (c) => `${c.paidCount}건` },
  { key: "amount", header: "지급 금액", className: "text-right", render: (c) => formatKRW(c.paidAmount) },
];

const downloadHistoryColumns: Column<DownloadHistoryRow>[] = [
  { key: "admin", header: "다운로드한 관리자", render: (d) => d.admin?.name ?? "-" },
  { key: "count", header: "행 수", className: "text-right", render: (d) => `${d.row_count}건` },
  { key: "at", header: "다운로드 일시", render: (d) => formatDateTime(d.downloaded_at) },
];

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilters>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: departments }, { rows, error }, { data: historyData }] = await Promise.all([
    supabase
      .from("departments")
      .select("id, name")
      .eq("dept_type", "SALES")
      .eq("is_active", true)
      .order("id"),
    fetchReportRows(sp),
    supabase
      .from("report_downloads")
      .select("id, row_count, downloaded_at, admin:users!report_downloads_downloaded_by_fkey(name)")
      .order("downloaded_at", { ascending: false })
      .limit(10),
  ]);

  const downloadQuery = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v) as [string, string][],
  ).toString();

  const totalRequested = sumRequested(rows);
  const totalApproved = sumApproved(rows);
  const totalPaid = sumPaid(rows);
  const avgDays = averageProcessingDays(rows);
  const history = (historyData ?? []) as unknown as DownloadHistoryRow[];

  return (
    <>
      <PageHeader
        title="통계 및 다운로드"
        description="검색 조건에 맞는 신청 통계를 확인하고 목록을 CSV로 내려받습니다."
        action={
          <Button href={`/api/admin/reports/requests${downloadQuery ? `?${downloadQuery}` : ""}`}>
            CSV 다운로드
          </Button>
        }
      />

      <Card className="mb-6">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input id="from" name="from" type="date" label="신청 기간 (시작)" defaultValue={sp.from ?? ""} />
          <Input id="to" name="to" type="date" label="신청 기간 (종료)" defaultValue={sp.to ?? ""} />
          <Select id="dept" name="dept" label="영업국" defaultValue={sp.dept ?? ""}>
            <option value="">전체</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Input
            id="applicant"
            name="applicant"
            label="신청자"
            placeholder="이름 검색"
            defaultValue={sp.applicant ?? ""}
          />
          <Select id="status" name="status" label="신청 상태" defaultValue={sp.status ?? ""}>
            <option value="">전체</option>
            {Object.entries(STATUS_LABEL)
              .filter(([value]) => value !== "DRAFT")
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </Select>
          <Select id="category" name="category" label="경조 구분" defaultValue={sp.category ?? ""}>
            <option value="">전체</option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            id="client"
            name="client"
            label="거래처명"
            placeholder="거래처명 검색"
            defaultValue={sp.client ?? ""}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              id="payFrom"
              name="payFrom"
              type="date"
              label="지급 희망일 (시작)"
              defaultValue={sp.payFrom ?? ""}
            />
            <Input
              id="payTo"
              name="payTo"
              type="date"
              label="지급 희망일 (종료)"
              defaultValue={sp.payTo ?? ""}
            />
          </div>
          <div className="flex items-end gap-2 lg:col-start-4">
            <Button type="submit" className="flex-1">
              검색
            </Button>
            <Button variant="secondary" href="/admin/statistics">
              초기화
            </Button>
          </div>
        </form>
      </Card>

      {error ? (
        <Card>
          <p className="text-sm text-red-600">통계를 불러오지 못했습니다: {error}</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="검색 결과" value={`${rows.length}건`} sub="임시저장 제외" />
            <StatCard label="신청 금액 합계" value={formatKRW(totalRequested)} />
            <StatCard label="승인 금액 합계" value={formatKRW(totalApproved)} />
            <StatCard label="지급 금액 합계" value={formatKRW(totalPaid)} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label="평균 처리 기간"
              value={avgDays != null ? `${avgDays.toFixed(1)}일` : "-"}
              sub="제출일 → 최초 승인일 기준"
            />
            <StatCard label="다운로드 대상 행 수" value={`${rows.length}건`} sub="화면 합계와 동일한 데이터" />
          </div>

          <Card title="상태별 건수" className="mt-6">
            <div className="flex flex-wrap gap-3">
              {statusCounts(rows).map((s) => (
                <span
                  key={s.status}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
                >
                  {s.label} <span className="font-semibold text-slate-900">{s.count}건</span>
                </span>
              ))}
              {rows.length === 0 && <p className="text-sm text-slate-400">데이터가 없습니다.</p>}
            </div>
          </Card>

          <Card title="월별 신청·승인·지급 금액" className="mt-6">
            <Table
              columns={monthlyColumns}
              rows={monthlyBreakdown(rows)}
              rowKey={(m) => m.month}
              emptyMessage="데이터가 없습니다."
            />
          </Card>

          <Card title="영업국별 금액" className="mt-6">
            <Table
              columns={groupColumns("영업국")}
              rows={byDepartment(rows)}
              rowKey={(g) => g.key}
              emptyMessage="데이터가 없습니다."
            />
          </Card>

          <Card title="경조 구분별 금액" className="mt-6">
            <Table
              columns={groupColumns("경조 구분")}
              rows={byCategory(rows)}
              rowKey={(g) => g.key}
              emptyMessage="데이터가 없습니다."
            />
          </Card>

          <Card title="거래처별 지급 내역" className="mt-6">
            <Table
              columns={clientColumns}
              rows={byClient(rows)}
              rowKey={(c) => c.client}
              emptyMessage="지급 완료된 건이 없습니다."
            />
          </Card>

          <Card title="다운로드 이력" className="mt-6">
            <Table
              columns={downloadHistoryColumns}
              rows={history}
              rowKey={(d) => String(d.id)}
              emptyMessage="다운로드 이력이 없습니다."
            />
          </Card>
        </>
      )}
    </>
  );
}
