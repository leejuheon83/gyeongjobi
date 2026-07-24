import { STATUS_LABEL, type RequestStatus } from "@/lib/types";

const styles: Record<RequestStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-brand-sky/10 text-brand-navy",
  REVIEWING: "bg-amber-50 text-amber-700",
  // 신청자의 조치가 필요한 상태라 REVIEWING(관리자 대기)과 확실히 구분되는 색으로 분리
  REVISION_REQUESTED: "bg-rose-50 text-rose-700",
  RESUBMITTED: "bg-purple-50 text-purple-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  PAID: "bg-indigo-50 text-indigo-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

// 처리 이력 타임라인 등에서 배지와 같은 색상 체계로 상태를 한눈에 구분할 때 사용한다.
export const STATUS_DOT_CLASS: Record<RequestStatus, string> = {
  DRAFT: "bg-slate-300",
  SUBMITTED: "bg-brand-sky",
  REVIEWING: "bg-amber-500",
  REVISION_REQUESTED: "bg-rose-500",
  RESUBMITTED: "bg-purple-500",
  APPROVED: "bg-emerald-500",
  REJECTED: "bg-red-500",
  PAID: "bg-indigo-500",
  CANCELLED: "bg-slate-300",
};

export default function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${styles[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
