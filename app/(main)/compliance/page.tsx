import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/ui/Card";

const CHECKLIST_ITEMS = [
  "대상자가 「청탁금지법(김영란법)」상 공직자등(공무원, 언론사 임직원, 사립학교 교직원 등)에 해당하는지 확인했습니다.",
  "신청 금액이 경조사 가액 한도 이내인지 확인했습니다. (하단 '경조사 가액 한도' 표 참고)",
  "화환·조화와 경조비 현금을 동시에 지급하는 경우, 합산 한도를 초과하지 않는지 확인했습니다.",
  "신청 사유가 사교·의례 목적이며, 직무와 관련한 대가성이 없는지 확인했습니다.",
  "동일 대상자·동일 경조사에 대해 중복으로 신청하지 않았는지 확인했습니다.",
  "대상자가 공직자등이 아니더라도, 사내 대외경조비 신청 한도와 절차를 준수했는지 확인했습니다.",
];

const LIMIT_ROWS = [
  { method: "화환(조화)만 지급", limit: "10만원" },
  { method: "경조비 현금만 지급 (축의금/조의금)", limit: "5만원" },
  { method: "화환 + 경조비 현금 동시 지급", limit: "합산 10만원 이내" },
];

function CheckIcon() {
  return (
    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-sky/10 text-brand-navy">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path
          d="M2.5 6.5 5 9l4.5-6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function ComplianceGuidePage() {
  return (
    <>
      <PageHeader
        title="김영란법 안내"
        description="대외경조비를 신청하기 전 아래 항목을 확인해 주세요."
      />

      <Card title="신청 전 체크리스트">
        <ul className="space-y-3">
          {CHECKLIST_ITEMS.map((item) => (
            <li key={item} className="flex gap-3">
              <CheckIcon />
              <p className="text-sm text-slate-700">{item}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="경조사 가액 한도" className="mt-6">
        <p className="text-sm text-slate-700">
          청탁금지법 경조사 가액 한도: <span className="font-semibold">10만원</span>{" "}
          (법인·개인 구분 없이 합산 산정)
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2.5 font-medium whitespace-nowrap text-slate-600">
                  경조사 방식
                </th>
                <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-slate-600">
                  한도
                </th>
              </tr>
            </thead>
            <tbody>
              {LIMIT_ROWS.map((row) => (
                <tr key={row.method} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3 text-slate-700">{row.method}</td>
                  <td className="px-3 py-3 text-right font-medium text-slate-900">
                    {row.limit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          위반 사례: 경조비 5만원 + 화환 10만원(X) · 경조비 7만원(X) + 화환 3만원
        </p>
      </Card>

      <Card title="유의사항" className="mt-6 border-amber-200 bg-amber-50/50">
        <p className="text-sm text-slate-700">
          위 기준은 사내 안내 자료를 바탕으로 하며, 실제 법적 기준은 법령 개정에 따라 달라질 수
          있습니다. 신청 전 정확한 기준은 경영지원팀에 문의해 주세요.
        </p>
      </Card>
    </>
  );
}
