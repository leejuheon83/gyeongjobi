"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 사용자에게는 일반 메시지만 보여주고, 실제 오류는 서버 로그로만 남긴다
    console.error("Unhandled page error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">일시적인 오류가 발생했습니다</h1>
      <p className="max-w-sm text-sm text-slate-500">
        잠시 후 다시 시도해 주세요. 문제가 계속되면 경영지원팀에 문의해 주세요.
      </p>
      <Button onClick={reset}>다시 시도</Button>
    </div>
  );
}
