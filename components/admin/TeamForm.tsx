"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createTeam,
  renameTeam,
  setTeamActive,
} from "@/app/(main)/admin/departments/actions";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export function NewTeamForm({
  departmentId,
  nextSortOrder,
}: {
  departmentId: number;
  nextSortOrder: number;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createTeam({
        departmentId,
        code,
        name,
        sortOrder: nextSortOrder,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setCode("");
        setName("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <Input
          id={`new_team_code_${departmentId}`}
          label="팀 코드"
          placeholder="예: T10"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Input
          id={`new_team_name_${departmentId}`}
          label="팀 이름"
          placeholder="예: 신규팀"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={pending || !code.trim() || !name.trim()}
        >
          {pending ? "추가 중..." : "팀 추가"}
        </Button>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function TeamRow({
  id,
  code,
  name,
  sortOrder,
  isActive,
}: {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onRename() {
    setError(null);
    startTransition(async () => {
      const result = await renameTeam({ id, name: draftName, sortOrder });
      if (result.error) {
        setError(result.error);
      } else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function onToggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await setTeamActive({ id, isActive: !isActive });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2 border-b border-slate-100 py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500">
          {code}
        </span>
        {editing ? (
          <input
            className="h-8 rounded-md border border-slate-300 px-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
        ) : (
          <span className="text-sm text-slate-800">{name}</span>
        )}
        {!isActive && (
          <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-500">비활성</span>
        )}
        <div className="ml-auto flex gap-1.5">
          {editing ? (
            <>
              <Button
                size="sm"
                onClick={onRename}
                disabled={pending || !draftName.trim() || draftName.trim() === name}
              >
                저장
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraftName(name);
                  setError(null);
                }}
              >
                취소
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                이름 변경
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onToggleActive}
                disabled={pending}
              >
                {isActive ? "비활성화" : "활성화"}
              </Button>
            </>
          )}
        </div>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
