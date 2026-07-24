import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import DepartmentBudgetOverview, {
  type DepartmentBudgetOverviewRow,
} from "@/components/requests/DepartmentBudgetOverview";
import RequestForm from "@/components/requests/RequestForm";
import { getProfile } from "@/lib/auth";
import { toFormValues } from "@/lib/request-form";
import { createClient } from "@/lib/supabase/server";
import type { AttachmentRow, RequestRow, TeamRow } from "@/lib/types";

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
  const editableStatuses = ["DRAFT", "SUBMITTED", "REVIEWING", "REVISION_REQUESTED", "RESUBMITTED"];
  if (!editableStatuses.includes(request.status) || request.applicant_id !== profile.id) {
    redirect(`/requests/${id}`);
  }

  const isRevision = request.status === "REVISION_REQUESTED";
  // 이미 제출·검토중·재제출 상태 — 상태 전이 없이 내용만 고치는 인플라이트 수정
  const inFlightEdit = ["SUBMITTED", "REVIEWING", "RESUBMITTED"].includes(request.status);
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
        title={isRevision ? "보완 후 재신청" : inFlightEdit ? "신청 내용 수정" : "임시저장 신청서 작성"}
        description={
          isRevision
            ? `${request.request_no} · 보완 요청된 신청서를 수정하고 재신청합니다.`
            : inFlightEdit
              ? `${request.request_no} · 접수된 신청서 내용을 수정합니다. 처리 상태는 바뀌지 않습니다.`
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
        submitLabel={isRevision ? "재신청" : inFlightEdit ? "저장" : "제출"}
        draftLabel={isRevision ? "저장" : "임시저장"}
        revisionNote={
          isRevision
            ? (revisionNote ?? "보완 요청 사유가 등록되지 않았습니다. 관리자 의견을 확인해 주세요.")
            : undefined
        }
        teams={teams}
        divisionName={profile.departmentName}
        inFlightEdit={inFlightEdit}
      />
    </>
  );
}
