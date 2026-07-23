import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import { getProfile } from "@/lib/auth";
import { withNotificationLink } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/lib/types";

export default async function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const notifications = ((data ?? []) as NotificationRow[]).map((n) =>
    withNotificationLink(n, profile.role),
  );

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        user={{
          name: profile.name,
          deptName: profile.departmentName,
          role: profile.role,
        }}
        notifications={notifications}
      />
      <main className="min-w-0 flex-1 px-4 pt-18 pb-8 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
