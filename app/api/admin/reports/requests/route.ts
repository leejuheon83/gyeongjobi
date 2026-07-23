import { getProfile } from "@/lib/auth";
import { buildReportCsv, type ReportFilters } from "@/lib/report";
import { fetchReportRows } from "@/lib/report-query";
import { createClient } from "@/lib/supabase/server";

// 관리자 통계 화면과 동일한 필터·동일한 조회 함수를 사용해
// 화면 합계와 다운로드 파일 합계가 항상 일치하도록 한다.
export async function GET(request: Request) {
  const profile = await getProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });
  if (profile.role !== "SUPPORT_ADMIN") {
    return new Response("Forbidden: 관리자만 다운로드할 수 있습니다.", { status: 403 });
  }

  const url = new URL(request.url);
  const filters: ReportFilters = {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    dept: url.searchParams.get("dept") ?? undefined,
    applicant: url.searchParams.get("applicant") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    client: url.searchParams.get("client") ?? undefined,
    payFrom: url.searchParams.get("payFrom") ?? undefined,
    payTo: url.searchParams.get("payTo") ?? undefined,
  };

  const { rows, error } = await fetchReportRows(filters);
  if (error) return new Response(`통계를 불러오지 못했습니다: ${error}`, { status: 500 });

  const csv = buildReportCsv(rows);

  const supabase = await createClient();
  await supabase.from("report_downloads").insert({
    downloaded_by: profile.id,
    filters: filters as unknown as Record<string, string>,
    row_count: rows.length,
  });

  const filename = `대외경조비_신청내역_${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
