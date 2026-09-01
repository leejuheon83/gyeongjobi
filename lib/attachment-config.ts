// 첨부파일 정책 (클라이언트·서버 공용)

export const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;

export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png";

export const MAX_FILE_SIZE_MB = Number(
  process.env.NEXT_PUBLIC_ATTACHMENT_MAX_FILE_MB ?? "10",
);

export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// 확장자별 기대 MIME (매직 바이트 검증 결과와 대조)
export const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

// 다운로드 응답에 그대로 실어도 되는 MIME.
// attachments.mime_type은 REST API로 직접 조작할 여지가 있으므로, text/html 같은 값이
// 브라우저에서 실행되지 않도록 서빙 시점에 허용 목록으로 다시 거른다.
const SERVEABLE_MIME = new Set(Object.values(EXTENSION_MIME));

export function safeContentType(mimeType: string | null): string {
  return mimeType && SERVEABLE_MIME.has(mimeType) ? mimeType : "application/octet-stream";
}

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
