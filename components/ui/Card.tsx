import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function Card({ title, action, className = "", children }: CardProps) {
  return (
    <section
      className={`rounded-xl border border-slate-200/80 bg-white shadow-sm ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between rounded-t-xl border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

type StatCardTone = "default" | "warning" | "danger";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  // 실제 조치가 필요하거나(warning) 문제가 있는(danger) 값임을 시각적으로 강조한다.
  tone?: StatCardTone;
}

const statCardToneCls: Record<StatCardTone, { card: string; value: string }> = {
  default: { card: "border-slate-200/80 bg-white", value: "text-slate-900" },
  warning: { card: "border-amber-200 bg-amber-50/40", value: "text-amber-700" },
  danger: { card: "border-red-200 bg-red-50/40", value: "text-red-700" },
};

export function StatCard({ label, value, sub, tone = "default" }: StatCardProps) {
  const toneCls = statCardToneCls[tone];
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm transition-shadow hover:shadow-md ${toneCls.card}`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${toneCls.value}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
