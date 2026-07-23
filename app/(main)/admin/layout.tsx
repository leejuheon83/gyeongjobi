import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile();
  if (profile?.role !== "SUPPORT_ADMIN") redirect("/dashboard");

  return <>{children}</>;
}
