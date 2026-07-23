"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationRead(id: number): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "로그인이 필요합니다." };

  const supabase = await createClient();
  // RLS가 본인 알림만 수정 가능하도록 강제한다
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", profile.id);
  if (error) {
    console.error("notification update failed:", error);
    return { error: "처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/", "layout");
  return {};
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "로그인이 필요합니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);
  if (error) {
    console.error("notification update failed:", error);
    return { error: "처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/", "layout");
  return {};
}
