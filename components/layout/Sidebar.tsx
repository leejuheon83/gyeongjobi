"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/login/actions";
import NotificationBell from "@/components/layout/NotificationBell";
import type { NotificationWithLink } from "@/lib/notifications";
import { useEscapeKey } from "@/lib/use-escape-key";
import type { UserRole } from "@/lib/types";

interface SidebarUser {
  name: string;
  deptName: string;
  role: UserRole;
}

interface MenuItem {
  label: string;
  href: string;
}

interface MenuGroup {
  title: string;
  role: UserRole;
  items: MenuItem[];
}

const MENU: MenuGroup[] = [
  {
    title: "신청자",
    role: "SALES_USER",
    items: [
      { label: "대시보드", href: "/dashboard" },
      { label: "신규 신청", href: "/requests/new" },
      { label: "내 신청 내역", href: "/requests" },
    ],
  },
  {
    title: "참고",
    role: "SALES_USER",
    items: [{ label: "김영란법 안내", href: "/compliance" }],
  },
  {
    title: "관리자",
    role: "SUPPORT_ADMIN",
    items: [
      { label: "관리자 대시보드", href: "/admin" },
      { label: "신청 검토", href: "/admin/review" },
      { label: "예산 관리", href: "/admin/budget" },
      { label: "지급 관리", href: "/admin/payments" },
      { label: "부서/팀 관리", href: "/admin/departments" },
      { label: "통계 및 다운로드", href: "/admin/statistics" },
    ],
  },
  {
    title: "참고",
    role: "SUPPORT_ADMIN",
    items: [{ label: "김영란법 안내", href: "/compliance" }],
  },
];

function findActiveHref(groups: MenuGroup[], pathname: string) {
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  let best = "";
  for (const href of hrefs) {
    const match = pathname === href || pathname.startsWith(`${href}/`);
    if (match && href.length > best.length) best = href;
  }
  return best;
}

function MenuLinks({
  groups,
  onNavigate,
}: {
  groups: MenuGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const activeHref = findActiveHref(groups, pathname);

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-brand-sky/10 text-brand-navy font-semibold"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ user }: { user: SidebarUser }) {
  return (
    <div className="border-t border-slate-200 p-4">
      <p className="text-sm font-medium text-slate-900">{user.name}</p>
      <p className="text-xs text-slate-500">{user.deptName}</p>
      <form action={logout}>
        <button
          type="submit"
          className="mt-3 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-center text-xs text-slate-600 hover:bg-slate-50"
        >
          로그아웃
        </button>
      </form>
    </div>
  );
}

export default function Sidebar({
  user,
  notifications,
}: {
  user: SidebarUser;
  notifications: NotificationWithLink[];
}) {
  const [open, setOpen] = useState(false);
  const groups = MENU.filter((g) => g.role === user.role);
  const homeHref = user.role === "SUPPORT_ADMIN" ? "/admin" : "/dashboard";

  useEscapeKey(open, () => setOpen(false));

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="h-1 shrink-0 bg-gradient-to-r from-brand-sky via-brand-sky to-brand-gold" />
        <div className="flex h-20 items-center justify-between gap-3 border-b border-slate-200 px-5">
          <Link
            href={homeHref}
            aria-label="대외경조비 관리시스템 홈"
            className="min-w-0 transition-opacity hover:opacity-80"
          >
            <Image
              src="/logo.png"
              alt="SBS M&C"
              width={868}
              height={214}
              priority
              className="h-8 w-auto"
            />
          </Link>
          <NotificationBell notifications={notifications} align="left" />
        </div>
        <MenuLinks groups={groups} />
        <SidebarFooter user={user} />
      </aside>

      {/* 모바일 상단바 */}
      <header className="fixed inset-x-0 top-0 z-40 flex flex-col border-b border-slate-200 bg-white lg:hidden">
        <div className="h-1 shrink-0 bg-gradient-to-r from-brand-sky via-brand-sky to-brand-gold" />
        <div className="flex h-16 items-center justify-between px-4">
          <Link
            href={homeHref}
            aria-label="대외경조비 관리시스템 홈"
            className="transition-opacity hover:opacity-80"
          >
            <Image
              src="/logo.png"
              alt="SBS M&C"
              width={868}
              height={214}
              priority
              className="h-7 w-auto"
            />
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell notifications={notifications} />
            <button
              type="button"
              aria-label="메뉴 열기"
              onClick={() => setOpen(true)}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M3 5h14M3 10h14M3 15h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 모바일 드로어 */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="relative flex h-full w-64 flex-col bg-white">
            <div className="h-1 shrink-0 bg-gradient-to-r from-brand-sky via-brand-sky to-brand-gold" />
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
              <Image
                src="/logo.png"
                alt="SBS M&C"
                width={868}
                height={214}
                className="h-7 w-auto"
              />
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M4 4l10 10M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <MenuLinks groups={groups} onNavigate={() => setOpen(false)} />
            <SidebarFooter user={user} />
          </aside>
        </div>
      )}
    </>
  );
}
