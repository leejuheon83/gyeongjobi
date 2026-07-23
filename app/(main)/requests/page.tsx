import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input, { Select } from "@/components/ui/Input";
import StatusBadge from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { getProfile } from "@/lib/auth";
import { formatDate, formatKRW } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORY_LABEL,
  categoryLabel,
  STATUS_LABEL,
  type RequestRow,
} from "@/lib/types";

interface SearchFilters {
  from?: string;
  to?: string;
  no?: string;
  target?: string;
  client?: string;
  category?: string;
  status?: string;
}

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
  { key: "created_at", header: "신청일", render: (r) => formatDate(r.created_at) },
  { key: "target_name", header: "대상자명", render: (r) => r.target_name ?? "-" },
  { key: "client_company", header: "거래처명", render: (r) => r.client_company ?? "-" },
  { key: "category", header: "구분", render: (r) => categoryLabel(r.category) },
  {
    key: "requested_amount",
    header: "신청 금액",
    className: "text-right",
    render: (r) => (r.requested_amount != null ? formatKRW(r.requested_amount) : "-"),
  },
  {
    key: "approved_amount",
    header: "승인 금액",
    className: "text-right",
    render: (r) => (r.approved_amount != null ? formatKRW(r.approved_amount) : "-"),
  },
  { key: "status", header: "처리 상태", render: (r) => <StatusBadge status={r.status} /> },
  { key: "updated_at", header: "최종 처리일", render: (r) => formatDate(r.updated_at) },
];

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchFilters>;
}) {
  const sp = await searchParams;
  const profile = (await getProfile())!;
  const supabase = await createClient();

  let query = supabase.from("requests").select("*").eq("applicant_id", profile.id);
  if (sp.from) query = query.gte("created_at", sp.from);
  if (sp.to) query = query.lte("created_at", `${sp.to}T23:59:59.999`);
  if (sp.no?.trim()) query = query.ilike("request_no", `%${sp.no.trim()}%`);
  if (sp.target?.trim()) query = query.ilike("target_name", `%${sp.target.trim()}%`);
  if (sp.client?.trim()) query = query.ilike("client_company", `%${sp.client.trim()}%`);
  if (sp.category) query = query.eq("category", sp.category);
  if (sp.status) query = query.eq("status", sp.status);

  const { data } = await query.order("created_at", { ascending: false });
  const rows = (data ?? []) as RequestRow[];

  return (
    <>
      <PageHeader
        title="내 신청 내역"
        description="본인이 작성한 대외경조비 신청 목록입니다."
        action={<Button href="/requests/new">신규 신청</Button>}
      />

      <Card className="mb-6">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            id="from"
            name="from"
            type="date"
            label="신청 기간 (시작)"
            defaultValue={sp.from ?? ""}
          />
          <Input
            id="to"
            name="to"
            type="date"
            label="신청 기간 (종료)"
            defaultValue={sp.to ?? ""}
          />
          <Input
            id="no"
            name="no"
            label="신청번호"
            placeholder="REQ-2026-0001"
            defaultValue={sp.no ?? ""}
          />
          <Input
            id="target"
            name="target"
            label="대상자명"
            placeholder="대상자명 검색"
            defaultValue={sp.target ?? ""}
          />
          <Input
            id="client"
            name="client"
            label="거래처명"
            placeholder="거래처명 검색"
            defaultValue={sp.client ?? ""}
          />
          <Select id="category" name="category" label="경조 구분" defaultValue={sp.category ?? ""}>
            <option value="">전체</option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select id="status" name="status" label="처리 상태" defaultValue={sp.status ?? ""}>
            <option value="">전체</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <div className="flex items-end gap-2">
            <Button type="submit" className="flex-1">
              검색
            </Button>
            <Button variant="secondary" href="/requests">
              초기화
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <p className="mb-3 text-sm text-slate-500">총 {rows.length}건</p>
        <Table
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          emptyMessage="조건에 맞는 신청 내역이 없습니다."
        />
      </Card>
    </>
  );
}
