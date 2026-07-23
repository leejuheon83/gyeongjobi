import { notFound } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import AttachmentSection from "@/components/requests/AttachmentSection";
import CancelButton from "@/components/requests/CancelButton";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import StatusBadge, { STATUS_DOT_CLASS } from "@/components/ui/StatusBadge";
import { getProfile } from "@/lib/auth";
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

interface RequestDetail extends RequestRow {
  applicant: { name: string } | null;
  department: { name: string } | null;
  team: { name: string } | null;
  attachments: AttachmentRow[];
  history: StatusHistoryRow[];
  comments: AdminCommentRow[];
  payment: {
    paid_amount: number;
    paid_at: string;
    note: string | null;
    accounting_reference: string | null;
  } | null;
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

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("requests")
    .select(
      `*,
      applicant:users!requests_applicant_id_fkey(name),
      department:departments(name),
      team:teams(name),
      attachments(*),
      history:request_status_history(*, actor:users!request_status_history_changed_by_fkey(name)),
      comments:admin_comments(*, admin:users!admin_comments_admin_id_fkey(name)),
      payment:payments(paid_amount, paid_at, note, accounting_reference)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const request = data as unknown as RequestDetail;
  const history = [...request.history].sort((a, b) => a.id - b.id);
  const comments = [...request.comments].sort((a, b) => a.id - b.id);

  const isOwner =
    profile?.id === request.applicant_id && profile?.role === "SALES_USER";
  const isOwnDraft = isOwner && request.status === "DRAFT";
  const canRevise = isOwner && request.status === "REVISION_REQUESTED";
  const canCancel =
    isOwner &&
    ["DRAFT", "SUBMITTED", "REVIEWING", "REVISION_REQUESTED", "RESUBMITTED"].includes(
      request.status,
    );

  const revisionNote =
    request.status === "REVISION_REQUESTED"
      ? (history.filter((h) => h.to_status === "REVISION_REQUESTED").at(-1)?.note ?? null)
      : null;

  return (
    <>
      <PageHeader
        title={`신청 상세 — ${request.request_no}`}
        description={`${formatDateTime(request.created_at)} 작성 · ${request.applicant?.name ?? "-"} (${request.department?.name ?? "-"})`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isOwnDraft && <Button href={`/requests/${request.id}/edit`}>이어서 작성</Button>}
            {canRevise && (
              <Button href={`/requests/${request.id}/edit`}>수정 후 재신청</Button>
            )}
            {canCancel && <CancelButton requestId={request.id} />}
            <StatusBadge status={request.status} />
          </div>
        }
      />

      <div className="space-y-6">
        {request.status === "REVISION_REQUESTED" && (
          <Card title="보완 요청 내용" className="border-orange-300 bg-orange-50/50">
            <p className="text-sm whitespace-pre-wrap text-slate-800">
              {revisionNote ?? "보완 요청 사유가 등록되지 않았습니다. 관리자 의견을 확인해 주세요."}
            </p>
            {isOwner && (
              <p className="mt-2 text-xs text-slate-500">
                내용을 수정한 뒤 "수정 후 재신청" 버튼으로 다시 제출해 주세요.
              </p>
            )}
          </Card>
        )}

        <Card title="대상자 정보">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="신청 팀" value={request.team?.name ?? "-"} />
            <Field label="대상자명" value={request.target_name ?? "-"} />
            <Field label="대상자 회사/기관" value={request.target_company ?? "-"} />
            <Field label="대상자 직위" value={request.target_position ?? "-"} />
            <Field label="신청자와의 관계" value={request.relationship ?? "-"} />
            <Field label="거래처명" value={request.client_company ?? "-"} />
            <Field label="담당 영업사원" value={request.sales_rep_name ?? "-"} />
          </dl>
        </Card>

        <Card title="경조 정보">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="경조 구분" value={categoryLabel(request.category)} />
            <Field label="경조 발생일" value={request.occurrence_date ?? "-"} />
            <Field label="행사일" value={request.event_date ?? "-"} />
            <Field label="장소" value={request.location ?? "-"} />
          </dl>
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <TextBlock label="신청 사유" value={request.reason} />
            <TextBlock label="업무 연관성" value={request.business_relevance} />
          </div>
        </Card>

        <Card title="지급 정보">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            {request.payment && (
              <>
                <Field label="실제 지급 금액" value={formatKRW(request.payment.paid_amount)} />
                <Field label="지급 일시" value={formatDateTime(request.payment.paid_at)} />
                <Field
                  label="회계 처리번호"
                  value={request.payment.accounting_reference ?? "-"}
                />
              </>
            )}
          </dl>
          {request.special_request && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <TextBlock label="요청사항" value={request.special_request} />
            </div>
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
          {(isOwnDraft || canRevise) && (
            <p className="mt-3 text-xs text-slate-400">
              파일 추가·삭제는 작성 화면에서 할 수 있습니다.
            </p>
          )}
        </Card>

        {comments.length > 0 && (
          <Card title="관리자 의견">
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-md bg-slate-50 px-3 py-2">
                  <p className="text-sm text-slate-700">{c.comment}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {c.admin?.name ?? "-"} · {formatDateTime(c.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="처리 이력">
          <ol className="space-y-4">
            {history.map((h) => (
              <li key={h.id} className="flex gap-3">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[h.to_status]}`}
                />
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

        <div className="flex justify-end">
          <Button variant="secondary" href="/requests">
            목록으로
          </Button>
        </div>
      </div>
    </>
  );
}
