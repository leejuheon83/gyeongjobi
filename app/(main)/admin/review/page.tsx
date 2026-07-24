import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input, { Select } from "@/components/ui/Input";
import StatusBadge from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { formatDate, formatKRW } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORY_LABEL,
  categoryLabel,
  STATUS_LABEL,
  targetSummary,
  type RequestWithNames,
} from "@/lib/types";

interface SearchFilters {
  from?: string;
  to?: string;
  dept?: string;
  applicant?: string;
  status?: string;
  category?: string;
  client?: string;
  payFrom?: string;
  payTo?: string;
}

const columns: Column<RequestWithNames>[] = [
  {
    key: "request_no",
    header: "신청번호",
    render: (r) => (
      <Link
        href={`/admin/review/${r.id}`}
        className="font-medium text-brand-navy hover:underline"
      >
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
  { key: "target", header: "대상", render: (r) => targetSummary(r) },
  { key: "client_company", header: "거래처명", render: (r) => r.client_company ?? "-" },
  {
    key: "amount",
    header: "신청 금액",
    className: "text-right",
    render: (r) => (r.requested_amount != null ? formatKRW(r.requested_amount) : "-"),
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
      <Button size="sm" variant="secondary" href={`/admin/review/${r.id}`}>
        검토
      </Button>
    ),
  },
];

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchFilters>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name")
    .eq("dept_type", "SALES")
    .eq("is_active", true)
    .order("id");

  let query = supabase
    .from("requests")
    .select(
      "*, applicant:users!requests_applicant_id_fkey!inner(name), department:departments(name)",
    )
    .neq("status", "DRAFT");
  if (sp.from) query = query.gte("created_at", sp.from);
  if (sp.to) query = query.lte("created_at", `${sp.to}T23:59:59.999`);
  if (sp.dept) query = query.eq("department_id", Number(sp.dept));
  if (sp.applicant?.trim()) query = query.ilike("applicant.name", `%${sp.applicant.trim()}%`);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.category) query = query.eq("category", sp.category);
  if (sp.client?.trim()) query = query.ilike("client_company", `%${sp.client.trim()}%`);
  if (sp.payFrom) query = query.gte("desired_payment_date", sp.payFrom);
  if (sp.payTo) query = query.lte("desired_payment_date", sp.payTo);

  const { data } = await query.order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as RequestWithNames[];

  // 상세 필터에 값이 이미 적용된 경우, 접혀서 안 보이는 채로 필터가 걸려 있으면 안 되므로 펼쳐서 표시
  const hasAdvancedFilter = Boolean(
    sp.dept || sp.applicant || sp.category || sp.client || sp.payFrom || sp.payTo,
  );

  return (
    <>
      <PageHeader
        title="신청 검토"
        description="제출된 대외경조비 신청을 검토하고 승인·보완요청·반려 처리합니다."
      />

      <Card className="mb-6">
        <form method="get" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input id="from" name="from" type="date" label="신청 기간 (시작)" defaultValue={sp.from ?? ""} />
            <Input id="to" name="to" type="date" label="신청 기간 (종료)" defaultValue={sp.to ?? ""} />
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
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1">
                검색
              </Button>
              <Button variant="secondary" href="/admin/review">
                초기화
              </Button>
            </div>
          </div>

          <details open={hasAdvancedFilter}>
            <summary className="cursor-pointer text-sm font-medium text-brand-navy select-none">
              상세 필터 (영업국·신청자·경조 구분·거래처명·지급 희망일)
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            </div>
          </details>
        </form>
      </Card>

      <Card>
        <p className="mb-3 text-sm text-slate-500">총 {rows.length}건</p>

        {/* 컬럼이 10개라 좁은 화면에서는 표 대신 카드 목록으로 보여준다 */}
        <div className="hidden lg:block">
          <Table
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            emptyMessage="조건에 맞는 신청이 없습니다."
          />
        </div>
        <div className="space-y-3 lg:hidden">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">조건에 맞는 신청이 없습니다.</p>
          ) : (
            rows.map((r) => (
              <Link
                key={r.id}
                href={`/admin/review/${r.id}`}
                className="block rounded-lg border border-slate-200 p-4 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-brand-navy">{r.request_no}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1.5 text-sm text-slate-700">
                  {r.applicant?.name ?? "-"} ({r.department?.name ?? "-"}) · {categoryLabel(r.category)}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {targetSummary(r)} · {r.client_company ?? "-"}
                </p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">{formatDate(r.created_at)}</span>
                  <span className="font-medium text-slate-900">
                    {r.requested_amount != null ? formatKRW(r.requested_amount) : "-"}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>
    </>
  );
}
