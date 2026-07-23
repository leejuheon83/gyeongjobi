import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import PaymentForm from "@/components/admin/PaymentForm";
import AttachmentSection from "@/components/requests/AttachmentSection";
import Card from "@/components/ui/Card";
import { getProfile } from "@/lib/auth";
import { targetSummary } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import type { AttachmentRow, RequestRow } from "@/lib/types";

function todayDateString() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function CompletePaymentPage({
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
      attachments(*)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const request = data as RequestRow & {
    applicant: { name: string } | null;
    department: { name: string } | null;
    attachments: AttachmentRow[];
  };
  if (request.status !== "APPROVED") {
    redirect(`/requests/${id}`);
  }

  const paymentAttachments = request.attachments
    .filter((a) => a.context === "PAYMENT")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <>
      <PageHeader
        title={`지급 완료 처리 — ${request.request_no}`}
        description={`${request.applicant?.name ?? "-"} (${request.department?.name ?? "-"}) · ${targetSummary(request)}`}
      />

      <div className="max-w-2xl space-y-6">
        <PaymentForm
          mode="complete"
          requestId={request.id}
          requestNo={request.request_no}
          approvedAmount={request.approved_amount}
          adminName={profile.name}
          expectedUpdatedAt={request.updated_at}
          initial={{
            paidAt: todayDateString(),
            paidAmount:
              request.approved_amount != null
                ? request.approved_amount.toLocaleString("ko-KR")
                : "",
            accountingReference: "",
            note: "",
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
      </div>
    </>
  );
}
