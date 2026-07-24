import { notFound } from "next/navigation";
import AdminEditRequestForm from "@/components/admin/AdminEditRequestForm";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import { toFormValues } from "@/lib/request-form";
import { createClient } from "@/lib/supabase/server";
import type { RequestRow, TeamRow } from "@/lib/types";

export default async function AdminEditRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("requests")
    .select("*, department:departments(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const request = data as RequestRow & { department: { name: string } | null };

  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, department_id, code, name, sort_order")
    .eq("department_id", request.department_id)
    .eq("is_active", true)
    .order("sort_order");
  const teams = (teamRows ?? []) as TeamRow[];

  return (
    <>
      <PageHeader
        title={`신청 내용 수정 — ${request.request_no}`}
        description="관리자 권한으로 신청 내용을 직접 수정합니다. 변경 내역은 관리자 메모에 기록됩니다."
        action={
          <Button variant="secondary" href={`/admin/review/${id}`}>
            검토 화면으로
          </Button>
        }
      />
      <AdminEditRequestForm
        requestId={request.id}
        updatedAt={request.updated_at}
        initial={toFormValues(request)}
        teams={teams}
        divisionName={request.department?.name ?? "-"}
        status={request.status}
      />
    </>
  );
}
