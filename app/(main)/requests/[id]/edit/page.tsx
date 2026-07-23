import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import DepartmentBudgetOverview, {
  type DepartmentBudgetOverviewRow,
} from "@/components/requests/DepartmentBudgetOverview";
import RequestForm from "@/components/requests/RequestForm";
import { getProfile } from "@/lib/auth";
import type { RequestFormValues } from "@/lib/request-form";
import { createClient } from "@/lib/supabase/server";
import type { AttachmentRow, RequestRow, TeamRow } from "@/lib/types";

function toFormValues(r: RequestRow): RequestFormValues {
  return {
    team_id: r.team_id != null ? String(r.team_id) : "",
    category: r.category ?? "",
    target_name: r.target_name ?? "",
    target_company: r.target_company ?? "",
    target_position: r.target_position ?? "",
    relationship: r.relationship ?? "",
    client_company: r.client_company ?? "",
    sales_rep_name: r.sales_rep_name ?? "",
    occurrence_date: r.occurrence_date ?? "",
    event_date: r.event_date ?? "",
    location: r.location ?? "",
    reason: r.reason ?? "",
    business_relevance: r.business_relevance ?? "",
    amount: r.requested_amount != null ? r.requested_amount.toLocaleString("ko-KR") : "",
    payment_method: r.payment_method ?? "",
    desired_payment_date: r.desired_payment_date ?? "",
    special_request: r.special_request ?? "",
  };
}

export default async function EditRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const profile = (await getProfile())!;
  const supabase = await createClient();
  const { data } = await supabase
    .from("requests")
    .select("*, attachments(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const request = data as RequestRow & { attachments: AttachmentRow[] };
  const editableStatuses = ["DRAFT", "REVISION_REQUESTED"];
  if (!editableStatuses.includes(request.status) || request.applicant_id !== profile.id) {
    redirect(`/requests/${id}`);
  }

  const isRevision = request.status === "REVISION_REQUESTED";
  let revisionNote: string | null = null;
  if (isRevision) {
    const { data: noteRows } = await supabase
      .from("request_status_history")
      .select("note")
      .eq("request_id", id)
      .eq("to_status", "REVISION_REQUESTED")
      .order("id", { ascending: false })
      .limit(1);
    revisionNote = noteRows?.[0]?.note ?? null;
  }

  const attachments = [...request.attachments].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  const currentYear = new Date().getFullYear();
  const [{ data: budgetRows }, { data: teamRows }] = await Promise.all([
    supabase.rpc("department_budget_overview", { p_year: currentYear }),
    supabase
      .from("teams")
      .select("id, department_id, code, name, sort_order")
      .eq("department_id", profile.departmentId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  const teams = (teamRows ?? []) as TeamRow[];

  return (
    <>
      <PageHeader
        title={isRevision ? "보완 후 재신청" : "임시저장 신청서 작성"}
        description={
          isRevision
            ? `${request.request_no} · 보완 요청된 신청서를 수정하고 재신청합니다.`
            : `${request.request_no} · 임시저장 상태의 신청서를 이어서 작성합니다.`
        }
      />
      <div className="mb-6 max-w-2xl">
        <DepartmentBudgetOverview
          rows={(budgetRows ?? []) as DepartmentBudgetOverviewRow[]}
          year={currentYear}
          myDepartmentId={profile.departmentId}
        />
      </div>
      <RequestForm
        requestId={request.id}
        updatedAt={request.updated_at}
        initial={toFormValues(request)}
        savedNotice={saved === "1"}
        attachments={attachments}
        submitLabel={isRevision ? "재신청" : "제출"}
        draftLabel={isRevision ? "저장" : "임시저장"}
        revisionNote={
          isRevision
            ? (revisionNote ?? "보완 요청 사유가 등록되지 않았습니다. 관리자 의견을 확인해 주세요.")
            : undefined
        }
        teams={teams}
        divisionName={profile.departmentName}
      />
    </>
  );
}
