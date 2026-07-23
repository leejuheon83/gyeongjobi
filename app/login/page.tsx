"use client";

import Image from "next/image";
import { useActionState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-100 p-4">
      {/* 배경 장식: SBS CI 컬러 은은한 그라데이션 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-sky via-brand-sky to-brand-gold"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-40 size-96 rounded-full bg-brand-sky/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-40 size-96 rounded-full bg-brand-gold/10 blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="SBS M&C"
            width={868}
            height={214}
            priority
            className="mx-auto h-10 w-auto"
          />
          <h1 className="mt-5 font-title text-2xl font-bold text-slate-900">대외경조비 관리시스템</h1>
          <p className="mt-2 text-sm text-slate-500">사내 계정으로 로그인해 주세요.</p>
        </div>
        <Card className="shadow-xl ring-1 ring-black/5">
          <form action={formAction} className="space-y-4">
            <Input
              id="email"
              name="email"
              type="email"
              label="이메일"
              placeholder="name@sbs.co.kr"
              autoComplete="email"
              required
            />
            <Input
              id="password"
              name="password"
              type="password"
              label="비밀번호"
              placeholder="비밀번호 입력"
              autoComplete="current-password"
              required
            />
            {state?.error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {state.error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "로그인 중..." : "로그인"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
