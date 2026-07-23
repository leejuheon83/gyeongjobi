"use client";

// 루트 레이아웃 자체에서 오류가 발생했을 때만 사용된다 (예: 환경 변수 누락).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-100 p-6 text-center text-slate-900 antialiased">
        <h1 className="text-lg font-semibold">시스템을 시작할 수 없습니다</h1>
        <p className="max-w-sm text-sm text-slate-500">
          일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={reset}
          className="h-10 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
