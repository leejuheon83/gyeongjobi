import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import DepartmentBudgetOverview, {
  type DepartmentBudgetOverviewRow,
} from "@/components/requests/DepartmentBudgetOverview";
import TeamBudgetOverview, {
  type TeamBudgetOverviewRow,
} from "@/components/requests/TeamBudgetOverview";
import Button from "@/components/ui/Button";
import Card, { StatCard } from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { getProfile } from "@/lib/auth";
import { formatKRW } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, targetSummary, type RequestRow } from "@/lib/types";

const columns: Column<RequestRow>[] = [
  {
    key: "request_no",
    header: "신청번호",
    render: (r) => (
      <Link href={`/requests/${r.id}`} className="font-medium text-blue-600 hover:underline">
        {r.request_no}
      </Link>
    ),
  },
  { key: "category", header: "구분", render: (r) => categoryLabel(r.category) },
  { key: "target", header: "대상", render: (r) => targetSummary(r) },
  {
    key: "amount",
    header: "신청 금액",
    className: "text-right",
    render: (r) => (r.requested_amount != null ? formatKRW(r.requested_amount) : "-"),
  },
  { key: "status", header: "상태", render: (r) => <StatusBadge status={r.status} /> },
];

export default async function DashboardPage() {
  const profile = (await getProfile())!;
  const supabase = await createClient();

  const currentYear = new Date().getFullYear();
  const [{ data }, { data: budgetRows }, { data: teamBudgetRows }] = await Promise.all([
    supabase
      .from("requests")
      .select("*")
      .eq("applicant_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("department_budget_overview", { p_year: currentYear }),
    supabase.rpc("team_budget_overview", { p_year: currentYear }),
  ]);
  const requests = (data ?? []) as RequestRow[];

  const inProgress = requests.filter((r) =>
    ["SUBMITTED", "REVIEWING", "RESUBMITTED"].includes(r.status),
  ).length;
  const needsAction = requests.filter((r) =>
    ["DRAFT", "REVISION_REQUESTED"].includes(r.status),
  ).length;
  const paidTotal = requests
    .filter((r) => r.status === "PAID")
    .reduce((sum, r) => sum + (r.approved_amount ?? r.requested_amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title={`${profile.name}님, 안녕하세요`}
        description={`${profile.departmentName} 대외경조비 신청 현황입니다.`}
        action={<Button href="/requests/new">신규 신청</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="검토 진행 중" value={`${inProgress}건`} sub="제출·검토중·재제출 상태" />
        <StatCard
          label="조치 필요"
          value={`${needsAction}건`}
          sub="임시저장·보완요청 상태"
          tone={needsAction > 0 ? "warning" : "default"}
        />
        <StatCard label="지급 완료 누계" value={formatKRW(paidTotal)} sub="승인 금액 기준" />
      </div>

      <div className="mt-6">
        <DepartmentBudgetOverview
          rows={(budgetRows ?? []) as DepartmentBudgetOverviewRow[]}
          year={currentYear}
          myDepartmentId={profile.departmentId}
        />
      </div>

      <div className="mt-6">
        <TeamBudgetOverview
          rows={(teamBudgetRows ?? []) as TeamBudgetOverviewRow[]}
          year={currentYear}
          divisionName={profile.departmentName}
        />
      </div>

      <Card
        title="최근 신청 내역"
        className="mt-6"
        action={
          <Link href="/requests" className="text-sm text-blue-600 hover:underline">
            전체 보기
          </Link>
        }
      >
        <Table columns={columns} rows={requests.slice(0, 5)} rowKey={(r) => r.id} />
      </Card>
    </>
  );
}
