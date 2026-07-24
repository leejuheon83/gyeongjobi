import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import Card, { StatCard } from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { formatDate, formatKRW } from "@/lib/format";
import { sumApproved, sumRequested } from "@/lib/report";
import { fetchReportRows } from "@/lib/report-query";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, type RequestWithNames } from "@/lib/types";

interface DeptUsage {
  department_id: number;
  department_name: string;
  budget_amount: number;
  committed_amount: number;
}

const pendingColumns: Column<RequestWithNames>[] = [
  {
    key: "request_no",
    header: "신청번호",
    render: (r) => (
      <Link href={`/requests/${r.id}`} className="font-medium text-brand-navy hover:underline">
        {r.request_no}
      </Link>
    ),
  },
  {
    key: "applicant",
    header: "신청자",
    render: (r) => `${r.applicant?.name ?? "-"} (${r.department?.name ?? "-"})`,
  },
  { key: "category", header: "구분", render: (r) => categoryLabel(r.category) },
  {
    key: "amount",
    header: "신청 금액",
    className: "text-right",
    render: (r) => (r.requested_amount != null ? formatKRW(r.requested_amount) : "-"),
  },
  { key: "status", header: "상태", render: (r) => <StatusBadge status={r.status} /> },
];

const recentColumns: Column<RequestWithNames>[] = [
  {
    key: "request_no",
    header: "신청번호",
    render: (r) => (
      <Link href={`/requests/${r.id}`} className="font-medium text-brand-navy hover:underline">
        {r.request_no}
      </Link>
    ),
  },
  { key: "created_at", header: "신청일", render: (r) => formatDate(r.created_at) },
  {
    key: "applicant",
    header: "신청자",
    render: (r) => `${r.applicant?.name ?? "-"} (${r.department?.name ?? "-"})`,
  },
  { key: "category", header: "구분", render: (r) => categoryLabel(r.category) },
  {
    key: "amount",
    header: "신청 금액",
    className: "text-right",
    render: (r) => (r.requested_amount != null ? formatKRW(r.requested_amount) : "-"),
  },
  { key: "status", header: "상태", render: (r) => <StatusBadge status={r.status} /> },
];

const deptUsageColumns: Column<DeptUsage>[] = [
  { key: "department", header: "영업국", render: (u) => u.department_name },
  { key: "budget", header: "예산", className: "text-right", render: (u) => formatKRW(u.budget_amount) },
  {
    key: "committed",
    header: "사용 예정액",
    className: "text-right",
    render: (u) => formatKRW(u.committed_amount),
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

function monthRange() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const to = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-01`;
  return { from, to };
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const currentYear = new Date().getFullYear();
  const { from, to } = monthRange();

  const [{ data: reqData }, { data: annual }, { data: usageData }, { rows: monthRows }] =
    await Promise.all([
      supabase
        .from("requests")
        .select("*, applicant:users!requests_applicant_id_fkey(name), department:departments(name)")
        .neq("status", "DRAFT")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("annual_budgets").select("total_amount").eq("year", currentYear).maybeSingle(),
      supabase.rpc("budget_summary", { p_year: currentYear }),
      fetchReportRows({ from, to }),
    ]);

  const requests = (reqData ?? []) as unknown as RequestWithNames[];
  const pendingReview = requests.filter((r) =>
    ["SUBMITTED", "RESUBMITTED", "REVIEWING"].includes(r.status),
  );
  const revisionRequested = requests.filter((r) => r.status === "REVISION_REQUESTED").length;
  const pendingPayment = requests.filter((r) => r.status === "APPROVED").length;
  const recent = requests.slice(0, 8);

  const totalBudget = annual?.total_amount ?? 0;
  const usage = (usageData ?? []) as DeptUsage[];
  const committedBudget = usage.reduce((s, u) => s + u.committed_amount, 0);
  const remainingBudget = totalBudget - committedBudget;

  const monthRequested = sumRequested(monthRows);
  const monthApproved = sumApproved(monthRows);

  return (
    <>
      <PageHeader title="관리자 대시보드" description="경영지원팀 대외경조비 관리 현황입니다." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="승인 대기"
          value={`${pendingReview.length}건`}
          sub="제출·재제출·검토중"
          tone={pendingReview.length > 0 ? "warning" : "default"}
        />
        <StatCard label="보완 요청" value={`${revisionRequested}건`} sub="신청자 재제출 대기" />
        <StatCard label="지급 대기" value={`${pendingPayment}건`} sub="승인 완료 건" />
        <StatCard
          label="예산 집행률"
          value={totalBudget > 0 ? `${Math.round((committedBudget / totalBudget) * 100)}%` : "-"}
          sub={`${formatKRW(committedBudget)} 사용 예정`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="이번 달 신청 금액" value={formatKRW(monthRequested)} />
        <StatCard label="이번 달 승인 금액" value={formatKRW(monthApproved)} />
        <StatCard label="전체 예산" value={formatKRW(totalBudget)} sub={`${currentYear}년 기준`} />
        <StatCard
          label="예산 잔액"
          value={formatKRW(remainingBudget)}
          sub={remainingBudget < 0 ? "예산 초과" : "사용 예정액 기준"}
          tone={remainingBudget < 0 ? "danger" : "default"}
        />
      </div>

      <Card title="영업국별 사용 현황" className="mt-6">
        <Table
          columns={deptUsageColumns}
          rows={usage}
          rowKey={(u) => String(u.department_id)}
          emptyMessage="영업국 데이터가 없습니다."
        />
      </Card>

      <Card
        title="검토 대기 신청"
        className="mt-6"
        action={
          <Link href="/admin/review" className="text-sm text-brand-navy hover:underline">
            전체 보기
          </Link>
        }
      >
        <Table
          columns={pendingColumns}
          rows={pendingReview}
          rowKey={(r) => r.id}
          emptyMessage="검토 대기 중인 신청이 없습니다."
        />
      </Card>

      <Card
        title="최근 신청 목록"
        className="mt-6"
        action={
          <Link href="/admin/statistics" className="text-sm text-brand-navy hover:underline">
            통계 보기
          </Link>
        }
      >
        <Table
          columns={recentColumns}
          rows={recent}
          rowKey={(r) => r.id}
          emptyMessage="신청 내역이 없습니다."
        />
      </Card>
    </>
  );
}
