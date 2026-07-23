export function formatKRW(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function formatDate(iso: string) {
  return iso.slice(0, 10);
}

export function formatBytes(bytes: number | null) {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
