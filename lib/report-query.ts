import { createClient } from "@/lib/supabase/server";
import type { ReportFilters, ReportRow } from "@/lib/report";

// 화면 통계·다운로드가 동일한 조회 결과를 쓰도록 하는 단일 진입점
export async function fetchReportRows(
  filters: ReportFilters,
): Promise<{ rows: ReportRow[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_request_report", {
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_department_id: filters.dept ? Number(filters.dept) : null,
    p_applicant: filters.applicant?.trim() || null,
    p_status: filters.status || null,
    p_category: filters.category || null,
    p_client: filters.client?.trim() || null,
    p_pay_from: filters.payFrom || null,
    p_pay_to: filters.payTo || null,
  });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as ReportRow[] };
}
