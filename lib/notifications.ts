import type { NotificationRow, UserRole } from "@/lib/types";

export interface NotificationWithLink extends NotificationRow {
  link: string | null;
}

// 권한이 없는 신청으로 이동하지 못하도록, 링크는 역할에 맞는 라우트로만 계산한다.
// 실제 접근 가능 여부는 목적지 페이지의 RLS·소유자 검사가 다시 한 번 검증한다.
export function withNotificationLink(
  n: NotificationRow,
  role: UserRole,
): NotificationWithLink {
  if (n.type === "BUDGET_WARNING") {
    return { ...n, link: "/admin/budget" };
  }
  if (!n.request_id) return { ...n, link: null };

  const link = role === "SUPPORT_ADMIN" ? `/admin/review/${n.request_id}` : `/requests/${n.request_id}`;
  return { ...n, link };
}
