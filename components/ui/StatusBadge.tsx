import { STATUS_LABEL, type RequestStatus } from "@/lib/types";

const styles: Record<RequestStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-blue-50 text-blue-700",
  REVIEWING: "bg-amber-50 text-amber-700",
  REVISION_REQUESTED: "bg-orange-50 text-orange-700",
  RESUBMITTED: "bg-sky-50 text-sky-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  PAID: "bg-indigo-50 text-indigo-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

// 처리 이력 타임라인 등에서 배지와 같은 색상 체계로 상태를 한눈에 구분할 때 사용한다.
export const STATUS_DOT_CLASS: Record<RequestStatus, string> = {
  DRAFT: "bg-slate-300",
  SUBMITTED: "bg-blue-500",
  REVIEWING: "bg-amber-500",
  REVISION_REQUESTED: "bg-orange-500",
  RESUBMITTED: "bg-sky-500",
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
