import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

interface NewRequestEmailParams {
  adminEmails: string[];
  requestId: string;
  requestNo: string;
  isResubmission: boolean;
  applicantName: string;
  departmentName: string;
  targetSummary: string;
  categoryLabel: string;
  amount: number | null;
}

// 신청서가 제출·재신청되면 경영지원팀 관리자에게 알림 이메일을 보낸다.
// GMAIL_USER/GMAIL_APP_PASSWORD가 설정되지 않았거나 발송에 실패해도 신청 처리 자체는 막지 않는다(베스트 에포트).
export async function sendNewRequestEmail(params: NewRequestEmailParams) {
  const client = getTransporter();
  if (!client || params.adminEmails.length === 0) return;

  const actionLabel = params.isResubmission ? "재신청" : "신규 신청";
  const detailUrl = env.SITE_URL ? `${env.SITE_URL}/admin/review/${params.requestId}` : null;

  const lines = [
    `${actionLabel}이 접수되었습니다.`,
    "",
    `신청번호: ${params.requestNo}`,
    `신청자: ${params.applicantName} (${params.departmentName})`,
    `대상자: ${params.targetSummary}`,
    `구분: ${params.categoryLabel}`,
    `신청 금액: ${params.amount != null ? `${params.amount.toLocaleString("ko-KR")}원` : "-"}`,
  ];
  if (detailUrl) {
    lines.push("", `검토 화면: ${detailUrl}`);
  }

  try {
    await client.sendMail({
      from: `"대외경조비 관리시스템" <${env.GMAIL_USER}>`,
      to: params.adminEmails,
      subject: `[대외경조비] ${actionLabel} 접수 - ${params.requestNo}`,
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("신청 알림 이메일 발송 실패:", err);
  }
}
