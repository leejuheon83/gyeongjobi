import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { formatDate, formatKRW } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, targetSummary, type RequestWithNames } from "@/lib/types";

interface PaidRow {
  id: number;
  paid_amount: number;
  paid_at: string;
  accounting_reference: string | null;
  request: RequestWithNames | null;
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
  { key: "target", header: "대상", render: (r) => targetSummary(r) },
  {
    key: "approved",
    header: "승인 금액",
    className: "text-right",
    render: (r) => (r.approved_amount != null ? formatKRW(r.approved_amount) : "-"),
  },
  {
    key: "desired_payment_date",
    header: "지급 희망일",
    render: (r) => r.desired_payment_date ?? "-",
  },
  { key: "status", header: "상태", render: (r) => <StatusBadge status={r.status} /> },
  {
    key: "actions",
    header: "처리",
    render: (r) => (
      <Button size="sm" href={`/admin/payments/${r.id}/complete`}>
        지급 완료
      </Button>
    ),
  },
];

const paidColumns: Column<PaidRow>[] = [
  {
    key: "request_no",
    header: "신청번호",
    render: (p) =>
      p.request ? (
        <Link
          href={`/requests/${p.request.id}`}
          className="font-medium text-brand-navy hover:underline"
        >
          {p.request.request_no}
        </Link>
      ) : (
        "-"
      ),
  },
  {
    key: "applicant",
    header: "신청자",
    render: (p) =>
      p.request ? `${p.request.applicant?.name ?? "-"} (${p.request.department?.name ?? "-"})` : "-",
  },
  {
    key: "target",
    header: "대상",
    render: (p) => (p.request ? targetSummary(p.request) : "-"),
  },
  {
    key: "paid_amount",
    header: "지급 금액",
    className: "text-right",
    render: (p) => formatKRW(p.paid_amount),
  },
  { key: "paid_at", header: "지급일", render: (p) => formatDate(p.paid_at) },
  {
    key: "accounting_reference",
    header: "회계 처리번호",
    render: (p) => p.accounting_reference ?? "-",
  },
  {
    key: "actions",
    header: "처리",
    render: (p) =>
      p.request ? (
        <Button size="sm" variant="secondary" href={`/admin/payments/${p.request.id}/edit`}>
          수정
        </Button>
      ) : null,
  },
];

export default async function PaymentsPage() {
  const supabase = await createClient();

  const [{ data: pendingData }, { data: paidData }] = await Promise.all([
    supabase
      .from("requests")
      .select("*, applicant:users!requests_applicant_id_fkey(name), department:departments(name)")
      .eq("status", "APPROVED")
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select(
        `id, paid_amount, paid_at, accounting_reference,
        request:requests(*, applicant:users!requests_applicant_id_fkey(name), department:departments(name))`,
      )
      .order("paid_at", { ascending: false }),
  ]);

  const pending = (pendingData ?? []) as unknown as RequestWithNames[];
  const paid = (paidData ?? []) as unknown as PaidRow[];

  return (
    <>
      <PageHeader
        title="지급 관리"
        description="승인된 신청 건의 지급 처리 및 지급 이력을 관리합니다."
      />

      <div className="space-y-6">
        <Card title={`지급 대기 (${pending.length}건)`}>
          {/* 컬럼이 8개라 좁은 화면에서는 표 대신 카드 목록으로 보여준다 */}
          <div className="hidden lg:block">
            <Table
              columns={pendingColumns}
              rows={pending}
              rowKey={(r) => r.id}
              emptyMessage="지급 대기 중인 건이 없습니다."
            />
          </div>
          <div className="space-y-3 lg:hidden">
            {pending.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">지급 대기 중인 건이 없습니다.</p>
            ) : (
              pending.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/requests/${r.id}`}
                      className="font-medium text-brand-navy hover:underline"
                    >
                      {r.request_no}
                    </Link>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700">
                    {r.applicant?.name ?? "-"} ({r.department?.name ?? "-"}) · {categoryLabel(r.category)}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{targetSummary(r)}</p>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-500">
                      지급 희망일 {r.desired_payment_date ?? "-"}
                    </span>
                    <span className="font-medium text-slate-900">
                      {r.approved_amount != null ? formatKRW(r.approved_amount) : "-"}
                    </span>
                  </div>
                  <Button size="sm" className="mt-3 w-full" href={`/admin/payments/${r.id}/complete`}>
                    지급 완료
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title={`지급 완료 (${paid.length}건)`}>
          <div className="hidden lg:block">
            <Table
              columns={paidColumns}
              rows={paid}
              rowKey={(p) => String(p.id)}
              emptyMessage="지급 완료된 건이 없습니다."
            />
          </div>
          <div className="space-y-3 lg:hidden">
            {paid.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">지급 완료된 건이 없습니다.</p>
            ) : (
              paid.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    {p.request ? (
                      <Link
                        href={`/requests/${p.request.id}`}
                        className="font-medium text-brand-navy hover:underline"
                      >
                        {p.request.request_no}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-900">-</span>
                    )}
                    <span className="font-medium text-slate-900">{formatKRW(p.paid_amount)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700">
                    {p.request
                      ? `${p.request.applicant?.name ?? "-"} (${p.request.department?.name ?? "-"})`
                      : "-"}
                    {" · "}
                    {p.request ? targetSummary(p.request) : "-"}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-500">{formatDate(p.paid_at)}</span>
                    <span className="text-slate-500">{p.accounting_reference ?? "-"}</span>
                  </div>
                  {p.request && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3 w-full"
                      href={`/admin/payments/${p.request.id}/edit`}
                    >
                      수정
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
