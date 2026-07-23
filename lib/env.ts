// 필수 환경 변수 검증. 값이 없으면 원인을 바로 알 수 있는 에러를 던진다
// (Supabase 클라이언트 내부의 알아보기 힘든 오류로 대체되는 것을 방지).
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `필수 환경 변수 ${name}가 설정되지 않았습니다. .env.local 파일을 확인해 주세요.`,
    );
  }
  return value;
}

export const env = {
  get SUPABASE_URL() {
    return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  },
  get SUPABASE_ANON_KEY() {
    return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  // 알림 이메일 발송용 Gmail SMTP 계정. 설정하지 않으면 이메일 발송을 건너뛴다(필수 기능이 아님).
  // GMAIL_APP_PASSWORD는 로그인 비밀번호가 아니라 구글 계정 보안 설정에서 발급하는 앱 비밀번호.
  get GMAIL_USER() {
    return process.env.GMAIL_USER;
  },
  get GMAIL_APP_PASSWORD() {
    return process.env.GMAIL_APP_PASSWORD;
  },
  // 알림 이메일에 넣을 검토 화면 링크의 기준 URL.
  // SITE_URL을 직접 지정하지 않으면, Vercel 배포 환경에서 자동 제공되는
  // 운영 도메인(VERCEL_PROJECT_PRODUCTION_URL)을 사용한다. 둘 다 없으면 링크 없이 발송한다.
  get SITE_URL() {
    if (process.env.SITE_URL) return process.env.SITE_URL;
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    }
    return undefined;
  },
};
