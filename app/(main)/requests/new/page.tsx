import { redirect } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import DepartmentBudgetOverview, {
  type DepartmentBudgetOverviewRow,
} from "@/components/requests/DepartmentBudgetOverview";
import RequestForm from "@/components/requests/RequestForm";
import { getProfile } from "@/lib/auth";
import { EMPTY_VALUES } from "@/lib/request-form";
import { createClient } from "@/lib/supabase/server";
import type { TeamRow } from "@/lib/types";

export default async function NewRequestPage() {
  const profile = (await getProfile())!;
  if (profile.role !== "SALES_USER") redirect("/admin");

  const supabase = await createClient();
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
        title="신규 신청"
        description="대외경조비 신청서를 작성합니다. 제출 후 경영지원팀 검토가 진행됩니다."
      />
      <div className="mb-6 max-w-2xl">
        <DepartmentBudgetOverview
          rows={(budgetRows ?? []) as DepartmentBudgetOverviewRow[]}
          year={currentYear}
          myDepartmentId={profile.departmentId}
        />
      </div>
      <RequestForm initial={EMPTY_VALUES} teams={teams} divisionName={profile.departmentName} />
    </>
  );
}
