import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import AdminCommentForm from "@/components/admin/AdminCommentForm";
import AdminDeleteRequestButton from "@/components/admin/AdminDeleteRequestButton";
import ReviewActions from "@/components/admin/ReviewActions";
import AttachmentSection from "@/components/requests/AttachmentSection";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import StatusBadge from "@/components/ui/StatusBadge";
import Table, { type Column } from "@/components/ui/Table";
import { formatDateTime, formatKRW } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  categoryLabel,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  type AdminCommentRow,
  type AttachmentRow,
  type RequestRow,
  type StatusHistoryRow,
} from "@/lib/types";

interface ReviewDetail extends RequestRow {
  applicant: { name: string; email: string } | null;
  department: { name: string } | null;
  team: { name: string } | null;
  attachments: AttachmentRow[];
  history: StatusHistoryRow[];
  comments: AdminCommentRow[];
}

interface RelatedRequest {
  id: string;
  request_no: string;
  created_at: string;
  event_date: string | null;
  requested_amount: number | null;
  approved_amount: number | null;
  status: RequestRow["status"];
  category: RequestRow["category"];
  applicant: { name: string } | null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm whitespace-pre-wrap text-slate-900">{value ?? "-"}</p>
    </div>
  );
}

const relatedColumns: Column<RelatedRequest>[] = [
  {
    key: "request_no",
    header: "신청번호",
    render: (r) => (
      <Link href={`/admin/review/${r.id}`} className="font-medium text-blue-600 hover:underline">
        {r.request_no}
      </Link>
    ),
  },
  { key: "applicant", header: "신청자", render: (r) => r.applicant?.name ?? "-" },
  { key: "category", header: "구분", render: (r) => categoryLabel(r.category) },
  { key: "event_date", header: "행사일", render: (r) => r.event_date ?? "-" },
  {
    key: "amount",
    header: "금액",
    className: "text-right",
    render: (r) =>
      r.approved_amount != null
        ? formatKRW(r.approved_amount)
        : r.requested_amount != null
          ? formatKRW(r.requested_amount)
          : "-",
  },
  { key: "status", header: "상태", render: (r) => <StatusBadge status={r.status} /> },
];

export default async function AdminReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("requests")
    .select(
      `*,
      applicant:users!requests_applicant_id_fkey(name, email),
      department:departments(name),
      team:teams(name),
      attachments(*),
      history:request_status_history(*, actor:users!request_status_history_changed_by_fkey(name)),
      comments:admin_comments(*, admin:users!admin_comments_admin_id_fkey(name))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const request = data as unknown as ReviewDetail;
  const history = [...request.history].sort((a, b) => a.id - b.id);
  const comments = [...request.comments].sort((a, b) => a.id - b.id);

  const currentYear = new Date().getFullYear();
  const [{ data: budgetRows }, { data: paymentRows }, sameTargetRes, sameClientRes] =
    await Promise.all([
      supabase
        .from("department_budgets")
        .select("amount, annual:annual_budgets!inner(year)")
        .eq("department_id", request.department_id)
        .eq("annual.year", currentYear),
      supabase
        .from("payments")
        .select("paid_amount, request:requests!inner(department_id)")
        .eq("request.department_id", request.department_id),
      request.target_name
        ? supabase
            .from("requests")
            .select(
              "id, request_no, created_at, event_date, requested_amount, approved_amount, status, category, applicant:users!requests_applicant_id_fkey(name)",
            )
            .eq("target_name", request.target_name)
            .neq("id", request.id)
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
      request.client_company
        ? supabase
            .from("requests")
            .select(
              "id, request_no, created_at, event_date, requested_amount, approved_amount, status, category, applicant:users!requests_applicant_id_fkey(name)",
            )
            .eq("client_company", request.client_company)
            .neq("id", request.id)
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
    ]);

  const budgetTotal = (budgetRows ?? []).reduce((s, b) => s + b.amount, 0);
  const budgetUsed = (paymentRows ?? []).reduce((s, p) => s + p.paid_amount, 0);

  const sameTarget = (sameTargetRes.data ?? []) as unknown as RelatedRequest[];
  const sameClient = (sameClientRes.data ?? []) as unknown as RelatedRequest[];
  const duplicates = sameTarget.filter(
    (r) =>
      request.event_date != null &&
      r.event_date === request.event_date &&
      r.status !== "CANCELLED" &&
      r.status !== "REJECTED",
  );

  const internalComments = comments.filter((c) => c.is_internal);
  const publicComments = comments.filter((c) => !c.is_internal);

  return (
    <>
      <PageHeader
        title={`신청 검토 — ${request.request_no}`}
        description={`${formatDateTime(request.created_at)} 신청 · ${request.applicant?.name ?? "-"} (${request.department?.name ?? "-"})`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" href="/admin/review">
              목록으로
            </Button>
            <Button variant="secondary" href={`/admin/review/${request.id}/edit`}>
              신청 내용 수정
            </Button>
            <StatusBadge status={request.status} />
          </div>
        }
      />

      <div className="space-y-6">
        {duplicates.length > 0 && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-800">중복 신청 가능성</p>
            <p className="mt-1 text-sm text-red-700">
              동일 대상자·동일 행사일({request.event_date})의 다른 신청이{" "}
              {duplicates.length}건 있습니다:{" "}
              {duplicates.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/review/${d.id}`} className="font-medium underline">
                    {d.request_no}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        )}

        <Card title="처리">
          <ReviewActions
            requestId={request.id}
            status={request.status}
            requestedAmount={request.requested_amount}
            expectedUpdatedAt={request.updated_at}
          />
        </Card>

        <Card title="신청 정보">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="신청자"
              value={`${request.applicant?.name ?? "-"} (${request.department?.name ?? "-"})`}
            />
            <Field label="신청 팀" value={request.team?.name ?? "-"} />
            <Field label="신청자 이메일" value={request.applicant?.email ?? "-"} />
            <Field label="담당 영업사원" value={request.sales_rep_name ?? "-"} />
            <Field label="대상자명" value={request.target_name ?? "-"} />
            <Field label="대상자 회사/기관" value={request.target_company ?? "-"} />
            <Field label="대상자 직위" value={request.target_position ?? "-"} />
            <Field label="신청자와의 관계" value={request.relationship ?? "-"} />
            <Field label="거래처명" value={request.client_company ?? "-"} />
            <Field label="경조 구분" value={categoryLabel(request.category)} />
            <Field label="경조 발생일" value={request.occurrence_date ?? "-"} />
            <Field label="행사일" value={request.event_date ?? "-"} />
            <Field label="장소" value={request.location ?? "-"} />
          </dl>
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <TextBlock label="신청 사유" value={request.reason} />
            <TextBlock label="업무 연관성" value={request.business_relevance} />
            {request.special_request && (
              <TextBlock label="요청사항" value={request.special_request} />
            )}
          </div>
        </Card>

        <Card title="금액·지급 정보">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="신청 금액"
              value={request.requested_amount != null ? formatKRW(request.requested_amount) : "-"}
            />
            <Field
              label="승인 금액"
              value={request.approved_amount != null ? formatKRW(request.approved_amount) : "-"}
            />
            <Field
              label="지급 형태"
              value={request.payment_method ? PAYMENT_METHOD_LABEL[request.payment_method] : "-"}
            />
            <Field label="지급 희망일" value={request.desired_payment_date ?? "-"} />
          </dl>
        </Card>

        <Card title={`${request.department?.name ?? "-"} 예산 현황 (${currentYear}년)`}>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="연간 예산" value={formatKRW(budgetTotal)} />
            <Field label="지급액" value={formatKRW(budgetUsed)} />
            <Field label="잔액" value={formatKRW(budgetTotal - budgetUsed)} />
          </dl>
          {request.requested_amount != null &&
            budgetTotal - budgetUsed < request.requested_amount && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                신청 금액이 해당 영업국 예산 잔액을 초과합니다.
              </p>
            )}
        </Card>

        <Card title="첨부파일">
          <AttachmentSection
            requestId={request.id}
            attachments={request.attachments
              .filter((a) => a.context === "APPLICATION")
              .sort((a, b) => a.created_at.localeCompare(b.created_at))}
            editable={false}
          />
        </Card>

        {request.status === "PAID" && (
          <Card title="지급 증빙파일">
            <AttachmentSection
              requestId={request.id}
              attachments={request.attachments
                .filter((a) => a.context === "PAYMENT")
                .sort((a, b) => a.created_at.localeCompare(b.created_at))}
              editable={false}
            />
            <p className="mt-3 text-xs text-slate-400">
              지급 증빙 추가·수정은{" "}
              <Link href={`/admin/payments/${request.id}/edit`} className="text-blue-600 hover:underline">
                지급 내역 수정
              </Link>{" "}
              화면에서 할 수 있습니다.
            </p>
          </Card>
        )}

        <Card title={`동일 대상자 신청 이력 (${sameTarget.length}건)`}>
          <Table
            columns={relatedColumns}
            rows={sameTarget}
            rowKey={(r) => r.id}
            emptyMessage="동일 대상자의 다른 신청이 없습니다."
          />
        </Card>

        <Card title={`동일 거래처 신청 이력 (${sameClient.length}건)`}>
          <Table
            columns={relatedColumns}
            rows={sameClient}
            rowKey={(r) => r.id}
            emptyMessage="동일 거래처의 다른 신청이 없습니다."
          />
        </Card>

        <Card title="관리자 메모·의견">
          {comments.length === 0 ? (
            <p className="text-sm text-slate-400">등록된 메모·의견이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {[...internalComments, ...publicComments]
                .sort((a, b) => a.id - b.id)
                .map((c) => (
                  <li key={c.id} className="rounded-md bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.is_internal
                            ? "bg-slate-200 text-slate-600"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {c.is_internal ? "내부" : "공개"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {c.admin?.name ?? "-"} · {formatDateTime(c.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">
                      {c.comment}
                    </p>
                  </li>
                ))}
            </ul>
          )}
          <AdminCommentForm requestId={request.id} />
        </Card>

        <Card title="처리 이력">
          <ol className="space-y-4">
            {history.map((h) => (
              <li key={h.id} className="flex gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : ""}
                    {STATUS_LABEL[h.to_status]}
                    <span className="ml-2 font-normal text-slate-500">
                      {h.actor?.name ?? "시스템"}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400">{formatDateTime(h.created_at)}</p>
                  {h.note && (
                    <p className="mt-1 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {h.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {request.status === "PAID" ? (
          <p className="text-xs text-slate-400">
            지급완료된 신청서는 완전 삭제할 수 없습니다. 삭제가 필요하면 먼저 신청 취소를
            이용해 주세요.
          </p>
        ) : (
          <AdminDeleteRequestButton requestId={request.id} requestNo={request.request_no} />
        )}
      </div>
    </>
  );
}
