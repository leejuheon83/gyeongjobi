// 개발 확인용 계정 생성 스크립트 (실행: node scripts/create-test-users.mjs)
// 운영 배포 전에는 반드시 계정과 비밀번호를 재정비할 것
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const PASSWORD = "Test1234!";
const accounts = [
  "sales1@company.co.kr",
  "sales2@company.co.kr",
  "sales3@company.co.kr",
  "admin@company.co.kr",
];

for (const email of accounts) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password: PASSWORD,
  });
  if (error) {
    console.error(`${email}: 실패 - ${error.message}`);
  } else {
    console.log(`${email}: 생성됨 (id: ${data.user?.id})`);
  }
}
