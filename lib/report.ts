// 관리자 통계·다운로드 공용 집계 로직
// 화면 통계와 다운로드 파일이 항상 같은 합계를 갖도록, 이 모듈의 함수만 사용한다.

import { CATEGORY_LABEL, STATUS_LABEL, type EventCategory, type RequestStatus } from "@/lib/types";

export interface ReportFilters {
  from?: string;
  to?: string;
  dept?: string;
  applicant?: string;
  status?: string;
  category?: string;
  client?: string;
  payFrom?: string;
  payTo?: string;
}

export interface ReportRow {
  id: string;
  request_no: string;
  department_name: string;
  applicant_name: string;
  target_name: string | null;
  client_company: string | null;
  category: EventCategory | null;
  requested_amount: number | null;
  approved_amount: number | null;
  paid_amount: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  status: RequestStatus;
  attachment_count: number;
}

export function sumRequested(rows: ReportRow[]) {
  return rows.reduce((s, r) => s + (r.requested_amount ?? 0), 0);
}
export function sumApproved(rows: ReportRow[]) {
  return rows.reduce((s, r) => s + (r.approved_amount ?? 0), 0);
}
export function sumPaid(rows: ReportRow[]) {
  return rows.reduce((s, r) => s + (r.paid_amount ?? 0), 0);
}

export interface MonthlyStat {
  month: string; // YYYY-MM
  requested: number;
  approved: number;
  paid: number;
}

// 신청금액=신청일 기준, 승인금액=승인일 기준, 지급금액=지급일 기준 각각 월 배정
export function monthlyBreakdown(rows: ReportRow[]): MonthlyStat[] {
  const map = new Map<string, MonthlyStat>();
  const ensure = (month: string) => {
    if (!map.has(month)) map.set(month, { month, requested: 0, approved: 0, paid: 0 });
    return map.get(month)!;
  };
  for (const r of rows) {
    if (r.submitted_at) ensure(r.submitted_at.slice(0, 7)).requested += r.requested_amount ?? 0;
    if (r.approved_at) ensure(r.approved_at.slice(0, 7)).approved += r.approved_amount ?? 0;
    if (r.paid_at) ensure(r.paid_at.slice(0, 7)).paid += r.paid_amount ?? 0;
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface GroupStat {
  key: string;
  label: string;
  requested: number;
  approved: number;
  paid: number;
  count: number;
}

export function byDepartment(rows: ReportRow[]): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const r of rows) {
    const key = r.department_name;
    if (!map.has(key)) map.set(key, { key, label: key, requested: 0, approved: 0, paid: 0, count: 0 });
    const g = map.get(key)!;
    g.requested += r.requested_amount ?? 0;
    g.approved += r.approved_amount ?? 0;
    g.paid += r.paid_amount ?? 0;
    g.count += 1;
  }
  return [...map.values()].sort((a, b) => b.requested - a.requested);
}

export function byCategory(rows: ReportRow[]): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const r of rows) {
    const key = r.category ?? "OTHER";
    const label = r.category ? CATEGORY_LABEL[r.category] : "-";
    if (!map.has(key)) map.set(key, { key, label, requested: 0, approved: 0, paid: 0, count: 0 });
    const g = map.get(key)!;
    g.requested += r.requested_amount ?? 0;
    g.approved += r.approved_amount ?? 0;
    g.paid += r.paid_amount ?? 0;
    g.count += 1;
  }
  return [...map.values()].sort((a, b) => b.requested - a.requested);
}

export interface ClientStat {
  client: string;
  paidAmount: number;
  paidCount: number;
}

// 거래처별 지급 내역: 지급완료 건만 집계
export function byClient(rows: ReportRow[]): ClientStat[] {
  const map = new Map<string, ClientStat>();
  for (const r of rows) {
    if (r.paid_amount == null) continue;
    const key = r.client_company ?? "-";
    if (!map.has(key)) map.set(key, { client: key, paidAmount: 0, paidCount: 0 });
    const c = map.get(key)!;
    c.paidAmount += r.paid_amount;
    c.paidCount += 1;
  }
  return [...map.values()].sort((a, b) => b.paidAmount - a.paidAmount);
}

export function statusCounts(rows: ReportRow[]): { status: RequestStatus; label: string; count: number }[] {
  const map = new Map<RequestStatus, number>();
  for (const r of rows) map.set(r.status, (map.get(r.status) ?? 0) + 1);
  return [...map.entries()]
    .map(([status, count]) => ({ status, label: STATUS_LABEL[status], count }))
    .sort((a, b) => b.count - a.count);
}

// 평균 처리 기간: 제출일 → 최초 승인일까지 걸린 일수 (승인된 건만 대상)
export function averageProcessingDays(rows: ReportRow[]): number | null {
  const durations = rows
    .filter((r) => r.submitted_at && r.approved_at)
    .map((r) => {
      const start = new Date(r.submitted_at!).getTime();
      const end = new Date(r.approved_at!).getTime();
      return (end - start) / (1000 * 60 * 60 * 24);
    });
  if (durations.length === 0) return null;
  return durations.reduce((s, d) => s + d, 0) / durations.length;
}

const CSV_COLUMNS: { key: string; header: string; render: (r: ReportRow) => string }[] = [
  { key: "request_no", header: "신청번호", render: (r) => r.request_no },
  { key: "department", header: "영업국", render: (r) => r.department_name },
  { key: "applicant", header: "신청자", render: (r) => r.applicant_name },
  { key: "target", header: "대상자", render: (r) => r.target_name ?? "" },
  { key: "client", header: "거래처", render: (r) => r.client_company ?? "" },
  { key: "category", header: "경조 구분", render: (r) => (r.category ? CATEGORY_LABEL[r.category] : "") },
  { key: "requested", header: "신청 금액", render: (r) => String(r.requested_amount ?? "") },
  { key: "approved", header: "승인 금액", render: (r) => String(r.approved_amount ?? "") },
  { key: "paid", header: "지급 금액", render: (r) => String(r.paid_amount ?? "") },
  { key: "submitted_at", header: "신청일", render: (r) => (r.submitted_at ? r.submitted_at.slice(0, 10) : "") },
  { key: "approved_at", header: "승인일", render: (r) => (r.approved_at ? r.approved_at.slice(0, 10) : "") },
  { key: "paid_at", header: "지급일", render: (r) => (r.paid_at ? r.paid_at.slice(0, 10) : "") },
  { key: "status", header: "상태", render: (r) => STATUS_LABEL[r.status] },
  { key: "attachment_count", header: "첨부파일 수", render: (r) => String(r.attachment_count) },
];

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// 신청번호·영업국·신청자·대상자·거래처·경조구분·금액3종·일자3종·상태·첨부파일 수만 포함한다.
// 신청 사유·업무 연관성·요청사항·이메일·관리자 메모 등은 의도적으로 제외 (개인정보 최소화)
export function buildReportCsv(rows: ReportRow[]): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => csvEscape(c.render(r))).join(","));
  const totalRow = [
    "합계",
    "",
    "",
    "",
    "",
    "",
    String(sumRequested(rows)),
    String(sumApproved(rows)),
    String(sumPaid(rows)),
    "",
    "",
    "",
    "",
    "",
  ].join(",");
  return ["﻿" + header, ...lines, totalRow].join("\r\n");
}
