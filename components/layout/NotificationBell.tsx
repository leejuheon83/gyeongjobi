"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(main)/notifications/actions";
import { formatDateTime } from "@/lib/format";
import { useEscapeKey } from "@/lib/use-escape-key";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/types";
import type { NotificationWithLink } from "@/lib/notifications";

export default function NotificationBell({
  notifications,
  align = "right",
}: {
  notifications: NotificationWithLink[];
  // 드롭다운이 펼쳐지는 방향. 좁은 좌측 사이드바에서는 "left"로 열어야 화면 밖으로 잘리지 않는다.
  align?: "left" | "right";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEscapeKey(open, () => setOpen(false));

  function onItemClick(n: NotificationWithLink) {
    setOpen(false);
    if (!n.is_read) markNotificationRead(n.id);
    if (n.link) router.push(n.link);
  }

  function onMarkAllRead() {
    markAllNotificationsRead();
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="알림"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M10 2a5 5 0 0 0-5 5v3.2c0 .5-.2 1-.5 1.4L3 13.5c-.5.6-.1 1.5.7 1.5h12.6c.8 0 1.2-.9.7-1.5l-1.5-2c-.3-.4-.5-.9-.5-1.4V7a5 5 0 0 0-5-5Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M8 17a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="알림 닫기"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className={`absolute z-50 mt-2 w-80 max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-xl ${
              align === "left" ? "left-0" : "right-0"
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <p className="text-sm font-semibold text-slate-900">알림</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="text-xs text-blue-600 hover:underline"
                >
                  모두 읽음 처리
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-slate-400">
                  알림이 없습니다.
                </li>
              ) : (
                notifications.map((n) => (
                  <li key={n.id} className="border-b border-slate-50 last:border-0">
                    <button
                      type="button"
                      onClick={() => onItemClick(n)}
                      className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${
                        n.is_read ? "" : "bg-blue-50/60"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {!n.is_read && <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />}
                        <span className="text-xs font-medium text-slate-500">
                          {NOTIFICATION_TYPE_LABEL[n.type]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-800">{n.message}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(n.created_at)}</p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
