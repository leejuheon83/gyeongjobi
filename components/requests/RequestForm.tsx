"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createDraftForAttachment, saveRequest } from "@/app/(main)/requests/actions";
import AttachmentSection from "@/components/requests/AttachmentSection";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input, { Select, Textarea } from "@/components/ui/Input";
import {
  EMPTY_VALUES,
  formatAmountInput,
  validateRequest,
  type RequestFormValues,
} from "@/lib/request-form";
import { useEscapeKey } from "@/lib/use-escape-key";
import {
  CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  type AttachmentRow,
  type EventCategory,
  type PaymentMethod,
  type TeamRow,
} from "@/lib/types";

type FieldErrors = Partial<Record<keyof RequestFormValues, string>>;

interface RequestFormProps {
  requestId?: string;
  updatedAt?: string;
  initial?: RequestFormValues;
  savedNotice?: boolean;
  attachments?: AttachmentRow[];
  submitLabel?: string;
  draftLabel?: string;
  revisionNote?: string;
  teams: TeamRow[];
  divisionName: string;
  // true면 임시저장 버튼을 숨기고 "제출 후 수정 불가" 경고도 표시하지 않는다.
  // 이미 제출·검토중·재제출 상태인 신청서를 상태 변경 없이 내용만 저장하는 경우에 사용.
  inFlightEdit?: boolean;
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL) as [EventCategory, string][];
// 계좌이체는 선택지에서 제외한다 (기존 데이터 표시는 PAYMENT_METHOD_LABEL을 그대로 사용하므로 영향 없음)
const PAYMENT_OPTIONS = (Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][]).filter(
  ([value]) => value !== "TRANSFER",
);

export default function RequestForm({
  requestId,
  updatedAt,
  initial,
  savedNotice,
  attachments = [],
  submitLabel = "제출",
  draftLabel = "임시저장",
  revisionNote,
  teams,
  divisionName,
  inFlightEdit = false,
}: RequestFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<RequestFormValues>(initial ?? EMPTY_VALUES);
  const [currentRequestId, setCurrentRequestId] = useState<string | undefined>(requestId);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEscapeKey(confirmOpen && !pending, () => setConfirmOpen(false));

  // 저장 전 새 신청서에서 첫 파일 첨부 시, draft를 만들어 id를 확보한다.
  async function ensureRequestId(): Promise<string | null> {
    if (currentRequestId) return currentRequestId;
    setServerError(null);
    const errors = validateRequest(values, "draft");
    if (errors.target_name) {
      setFieldErrors(errors);
      setServerError("파일을 첨부하려면 먼저 대상자명을 입력해 주세요.");
      return null;
    }
    const result = await createDraftForAttachment(values);
    if (result.fieldErrors) {
      setFieldErrors(result.fieldErrors);
      return null;
    }
    if (result.error || !result.id) {
      setServerError(result.error ?? "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return null;
    }
    setCurrentRequestId(result.id);
    return result.id;
  }

  function set<K extends keyof RequestFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function runSave(mode: "draft" | "submit") {
    setServerError(null);
    startTransition(async () => {
      const result = await saveRequest({ mode, id: currentRequestId, updatedAt, values });
      // 성공 시 서버 액션이 리다이렉트하므로 여기 도달하면 오류
      if (result?.fieldErrors) setFieldErrors(result.fieldErrors);
      if (result?.error) setServerError(result.error);
      setConfirmOpen(false);
    });
  }

  function onDraftSave() {
    const errors = validateRequest(values, "draft");
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    runSave("draft");
  }

  function onSubmitClick() {
    const errors = validateRequest(values, "submit");
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setServerError("입력하지 않은 필수 항목이 있습니다. 표시된 항목을 확인해 주세요.");
      return;
    }
    setServerError(null);
    setConfirmOpen(true);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {savedNotice && (
        <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          저장되었습니다. 이어서 작성하거나 나중에 다시 불러올 수 있습니다.
        </p>
      )}

      {revisionNote && (
        <div className="rounded-md border border-orange-300 bg-orange-50 px-4 py-3">
          <p className="text-sm font-semibold text-orange-800">보완 요청 내용</p>
          <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">{revisionNote}</p>
        </div>
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
            placeholder="예: 서울아산병원 장례식장"
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </div>
        <div className="mt-4 space-y-4">
          <Textarea
            id="reason"
            label="신청 사유"
            requiredMark
            placeholder="경조사 내용과 신청 배경을 입력해 주세요."
            value={values.reason}
            onChange={(e) => set("reason", e.target.value)}
            error={fieldErrors.reason}
          />
          <Textarea
            id="business_relevance"
            label="업무 연관성"
            requiredMark
            placeholder="해당 거래처와의 거래 관계, 업무상 필요성을 입력해 주세요."
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
            placeholder="50,000"
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
            placeholder="지급 관련 요청사항이 있으면 입력해 주세요."
            value={values.special_request}
            onChange={(e) => set("special_request", e.target.value)}
          />
        </div>
      </Card>

      <Card title="첨부파일">
        <AttachmentSection
          requestId={currentRequestId}
          attachments={attachments}
          editable={!inFlightEdit}
          ensureRequestId={ensureRequestId}
          onDraftUploaded={(id) => router.push(`/requests/${id}/edit?saved=1`)}
        />
        {!currentRequestId && (
          <p className="mt-3 text-xs text-slate-400">
            대상자명을 입력한 뒤 파일을 첨부하면 자동으로 임시저장됩니다.
          </p>
        )}
        {inFlightEdit && (
          <p className="mt-3 text-xs text-slate-400">
            첨부파일 추가·삭제는 임시저장 또는 보완요청 상태에서만 할 수 있습니다.
          </p>
        )}
      </Card>

      {serverError && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</p>
      )}

      <div className="flex justify-end gap-2">
        {!inFlightEdit && (
          <Button variant="secondary" onClick={onDraftSave} disabled={pending}>
            {draftLabel}
          </Button>
        )}
        <Button onClick={onSubmitClick} disabled={pending}>
          {submitLabel}
        </Button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="닫기"
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-confirm-title"
            className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 id="request-confirm-title" className="text-base font-semibold text-slate-900">
              신청서를 {submitLabel}할까요?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {inFlightEdit
                ? "이미 접수된 신청서의 내용을 수정합니다. 처리 상태는 바뀌지 않습니다."
                : `${submitLabel} 후에도 최종 승인·반려 전까지는 이어서 수정할 수 있습니다.`}
            </p>
            <dl className="mt-4 space-y-2 rounded-md bg-slate-50 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">신청 팀</dt>
                <dd className="font-medium text-slate-900">
                  {teams.find((t) => String(t.id) === values.team_id)?.name ?? "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">경조 구분</dt>
                <dd className="font-medium text-slate-900">
                  {CATEGORY_LABEL[values.category as EventCategory] ?? "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">대상자</dt>
                <dd className="font-medium text-slate-900">{values.target_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">행사일</dt>
                <dd className="font-medium text-slate-900">{values.event_date}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">신청 금액</dt>
                <dd className="font-medium text-slate-900">{values.amount}원</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">지급 형태</dt>
                <dd className="font-medium text-slate-900">
                  {PAYMENT_METHOD_LABEL[values.payment_method as PaymentMethod] ?? "-"}
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={pending}>
                취소
              </Button>
              <Button onClick={() => runSave("submit")} disabled={pending}>
                {pending ? "처리 중..." : submitLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
