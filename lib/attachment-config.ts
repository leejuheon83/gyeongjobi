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

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
