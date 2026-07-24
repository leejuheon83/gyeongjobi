export default function LoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-400"
    >
      <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-sky" />
      <p className="text-sm">불러오는 중입니다...</p>
    </div>
  );
}
