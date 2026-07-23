import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import PaymentForm from "@/components/admin/PaymentForm";
import AttachmentSection from "@/components/requests/AttachmentSection";
import Card from "@/components/ui/Card";
import Table, { type Column } from "@/components/ui/Table";
import { getProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  PAYMENT_FIELD_LABEL,
  targetSummary,
  type AttachmentRow,
  type PaymentCorrectionRow,
  type PaymentRow,
  type RequestRow,
} from "@/lib/types";

function formatFieldValue(field: string, value: string | number | null) {
  if (value === null || value === undefined) return "-";
  if (field === "paid_amount") return `${Number(value).toLocaleString("ko-KR")}원`;
  return String(value);
}

const correctionColumns: Column<PaymentCorrectionRow>[] = [
  {
    key: "changes",
    header: "변경 내용",
    render: (c) => (
      <ul className="space-y-0.5">
        {Object.keys(c.new_values).map((field) => (
          <li key={field}>
            <span className="text-slate-500">{PAYMENT_FIELD_LABEL[field] ?? field}: </span>
            {formatFieldValue(field, c.previous_values[field])}
            {" → "}
            <span className="font-medium text-slate-900">
              {formatFieldValue(field, c.new_values[field])}
            </span>
          </li>
        ))}
      </ul>
    ),
  },
  { key: "reason", header: "변경 사유", render: (c) => c.reason },
  { key: "corrector", header: "처리자", render: (c) => c.corrector?.name ?? "-" },
  { key: "corrected_at", header: "처리일시", render: (c) => formatDateTime(c.corrected_at) },
];

export default async function EditPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getProfile();
  if (profile?.role !== "SUPPORT_ADMIN") redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase
    .from("requests")
    .select(
      `*,
      applicant:users!requests_applicant_id_fkey(name),
      department:departments(name),
      attachments(*),
      payment:payments(*)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const request = data as RequestRow & {
    applicant: { name: string } | null;
    department: { name: string } | null;
    attachments: AttachmentRow[];
    payment: PaymentRow | null;
  };
  if (request.status !== "PAID" || !request.payment) {
    redirect(`/requests/${id}`);
  }
  const payment = request.payment;

  const { data: correctionData } = await supabase
    .from("payment_corrections")
    .select("*, corrector:users!payment_corrections_corrected_by_fkey(name)")
    .eq("payment_id", payment.id)
    .order("corrected_at", { ascending: false });
  const corrections = (correctionData ?? []) as unknown as PaymentCorrectionRow[];

  const paymentAttachments = request.attachments
    .filter((a) => a.context === "PAYMENT")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <>
      <PageHeader
        title={`지급 내역 수정 — ${request.request_no}`}
        description={`${request.applicant?.name ?? "-"} (${request.department?.name ?? "-"}) · ${targetSummary(request)}`}
      />

      <div className="max-w-2xl space-y-6">
        <PaymentForm
          mode="correct"
          requestId={request.id}
          requestNo={request.request_no}
          approvedAmount={request.approved_amount}
          adminName={profile.name}
          paymentId={payment.id}
          initial={{
            paidAt: payment.paid_at.slice(0, 10),
            paidAmount: payment.paid_amount.toLocaleString("ko-KR"),
            accountingReference: payment.accounting_reference ?? "",
            note: payment.note ?? "",
          }}
        />

        <Card title="지급 증빙파일">
          <AttachmentSection
            requestId={request.id}
            attachments={paymentAttachments}
            editable
            context="PAYMENT"
            uploadLabel="계좌이체 확인증 등 지급 증빙 자료를 첨부해 주세요."
          />
        </Card>

        <Card title={`수정 이력 (${corrections.length}건)`}>
          <Table
            columns={correctionColumns}
            rows={corrections}
            rowKey={(c) => String(c.id)}
            emptyMessage="수정 이력이 없습니다."
          />
        </Card>
      </div>
    </>
  );
}
