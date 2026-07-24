"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateRequestByAdmin } from "@/app/(main)/admin/review/actions";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input, { Select, Textarea } from "@/components/ui/Input";
import { formatAmountInput, validateRequest, type RequestFormValues } from "@/lib/request-form";
import { useEscapeKey } from "@/lib/use-escape-key";
import { CATEGORY_LABEL, PAYMENT_METHOD_LABEL, type EventCategory, type PaymentMethod, type TeamRow } from "@/lib/types";

type FieldErrors = Partial<Record<keyof RequestFormValues, string>>;

interface AdminEditRequestFormProps {
  requestId: string;
  updatedAt: string;
  initial: RequestFormValues;
  teams: TeamRow[];
  divisionName: string;
  status: string;
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL) as [EventCategory, string][];
const PAYMENT_OPTIONS = (Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][]).filter(
  ([value]) => value !== "TRANSFER",
);

export default function AdminEditRequestForm({
  requestId,
  updatedAt,
  initial,
  teams,
  divisionName,
  status,
}: AdminEditRequestFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<RequestFormValues>(initial);
  const [editReason, setEditReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEscapeKey(confirmOpen && !pending, () => setConfirmOpen(false));

  function set<K extends keyof RequestFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function onSaveClick() {
    const errors = validateRequest(values, "submit");
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setServerError("입력하지 않은 필수 항목이 있습니다. 표시된 항목을 확인해 주세요.");
      return;
    }
    if (!editReason.trim()) {
      setServerError("수정 사유를 입력해 주세요.");
      return;
    }
    setServerError(null);
    setConfirmOpen(true);
  }

  function runSave() {
    setServerError(null);
    startTransition(async () => {
      const result = await updateRequestByAdmin({
        requestId,
        expectedUpdatedAt: updatedAt,
        values,
        editReason,
      });
      // 성공 시 서버 액션이 리다이렉트하므로 여기 도달하면 오류
      if (result?.fieldErrors) setFieldErrors(result.fieldErrors);
      if (result?.error) setServerError(result.error);
      setConfirmOpen(false);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      {status === "PAID" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          이미 지급완료된 신청서입니다. 수정 시 실제 지급 내역과 불일치가 없는지 확인해 주세요.
        </p>
      )}

      <Card title="신청 팀">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            id="team_id"
            label={`신청 팀 (${divisionName})`}
            requiredMark
            value={values.team_id}
            onChange={(e) => set("team_id", e.target.value)}
            error={fieldErrors.team_id}
          >
            <option value="" disabled>
              팀 선택
            </option>
            {teams.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card title="대상자 정보">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="target_name"
            label="대상자명"
            requiredMark
            value={values.target_name}
            onChange={(e) => set("target_name", e.target.value)}
            error={fieldErrors.target_name}
          />
          <Input
            id="target_position"
            label="대상자 직위"
            value={values.target_position}
            onChange={(e) => set("target_position", e.target.value)}
          />
          <Input
            id="relationship"
            label="신청자와의 관계"
            requiredMark
            value={values.relationship}
            onChange={(e) => set("relationship", e.target.value)}
            error={fieldErrors.relationship}
          />
          <Input
            id="client_company"
            label="거래처명"
            requiredMark
            value={values.client_company}
            onChange={(e) => set("client_company", e.target.value)}
            error={fieldErrors.client_company}
          />
          <Input
            id="sales_rep_name"
            label="담당 영업사원(신청자)"
            value={values.sales_rep_name}
            onChange={(e) => set("sales_rep_name", e.target.value)}
          />
        </div>
      </Card>

      <Card title="경조 정보">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            id="category"
            label="경조 구분"
            requiredMark
            value={values.category}
            onChange={(e) => set("category", e.target.value)}
            error={fieldErrors.category}
          >
            <option value="" disabled>
              구분 선택
            </option>
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            id="occurrence_date"
            type="date"
            label="경조 발생일"
            requiredMark
            value={values.occurrence_date}
            onChange={(e) => set("occurrence_date", e.target.value)}
            error={fieldErrors.occurrence_date}
          />
          <Input
            id="event_date"
            type="date"
            label="행사일"
            requiredMark
            value={values.event_date}
            onChange={(e) => set("event_date", e.target.value)}
            error={fieldErrors.event_date}
          />
          <Input
            id="location"
            label="장소"
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </div>
        <div className="mt-4 space-y-4">
          <Textarea
            id="reason"
            label="신청 사유"
            requiredMark
            value={values.reason}
            onChange={(e) => set("reason", e.target.value)}
            error={fieldErrors.reason}
          />
          <Textarea
            id="business_relevance"
            label="업무 연관성"
            requiredMark
            value={values.business_relevance}
            onChange={(e) => set("business_relevance", e.target.value)}
            error={fieldErrors.business_relevance}
          />
        </div>
      </Card>

      <Card title="지급 정보">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="amount"
            label="신청 금액 (원, 최대 100,000원)"
            requiredMark
            inputMode="numeric"
            value={values.amount}
            onChange={(e) => set("amount", formatAmountInput(e.target.value))}
            error={fieldErrors.amount}
          />
          <Select
            id="payment_method"
            label="지급 형태"
            requiredMark
            value={values.payment_method}
            onChange={(e) => set("payment_method", e.target.value)}
            error={fieldErrors.payment_method}
          >
            <option value="" disabled>
              형태 선택
            </option>
            {PAYMENT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            id="desired_payment_date"
            type="date"
            label="지급 희망일"
            value={values.desired_payment_date}
            onChange={(e) => set("desired_payment_date", e.target.value)}
          />
        </div>
        <div className="mt-4">
          <Textarea
            id="special_request"
            label="요청사항"
            value={values.special_request}
            onChange={(e) => set("special_request", e.target.value)}
          />
        </div>
      </Card>

      <Card title="수정 사유">
        <Textarea
          id="edit_reason"
          label="이 신청서를 수정하는 사유 (처리 이력에 기록됩니다)"
          requiredMark
          placeholder="예: 신청자 요청으로 대상자 직위 오기재 정정"
          value={editReason}
          onChange={(e) => setEditReason(e.target.value)}
        />
      </Card>

      {serverError && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          취소
        </Button>
        <Button onClick={onSaveClick} disabled={pending}>
          저장
        </Button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="닫기"
            className="absolute inset-0 bg-black/50"
            onClick={() => !pending && setConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-edit-confirm-title"
            className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 id="admin-edit-confirm-title" className="text-base font-semibold text-slate-900">
              신청 내용을 수정할까요?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              변경 내용과 사유는 관리자 메모(내부용)에 기록됩니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={pending}>
                취소
              </Button>
              <Button onClick={runSave} disabled={pending}>
                {pending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
