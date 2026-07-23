import { createClient } from "@/lib/supabase/server";

// 파일 다운로드/미리보기 중계.
// RLS로 접근 권한을 검사한 뒤 서버가 스토리지에서 받아 스트리밍하므로
// 실제 저장 경로는 사용자에게 노출되지 않는다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: attachment } = await supabase
    .from("attachments")
    .select("file_name, storage_bucket, storage_path, mime_type")
    .eq("id", id)
    .maybeSingle();
  if (!attachment) return new Response("Not Found", { status: 404 });

  const { data: blob, error } = await supabase.storage
    .from(attachment.storage_bucket)
    .download(attachment.storage_path);
  if (error || !blob) return new Response("Not Found", { status: 404 });

  return new Response(blob, {
    headers: {
      "Content-Type": attachment.mime_type ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
