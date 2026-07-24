"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== "SUPPORT_ADMIN") {
    return { error: "관리자만 부서·팀을 관리할 수 있습니다." as const };
  }
  return { supabase: await createClient() };
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

export async function createDepartment(input: {
  code: string;
  name: string;
}): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const code = normalizeCode(input.code);
  const name = input.name.trim();
  if (!code || !name) return { error: "부서 코드와 이름을 입력해 주세요." };

  const { error } = await auth.supabase
    .from("departments")
    .insert({ code, name, dept_type: "SALES", is_active: true });
  if (error) {
    if (error.code === "23505") return { error: "이미 존재하는 부서 코드 또는 이름입니다." };
    return { error: error.message };
  }
  revalidatePath("/admin/departments");
  revalidatePath("/admin/budget");
  return {};
}

export async function renameDepartment(input: {
  id: number;
  name: string;
}): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const name = input.name.trim();
  if (!name) return { error: "부서 이름을 입력해 주세요." };

  const { error } = await auth.supabase
    .from("departments")
    .update({ name })
    .eq("id", input.id);
  if (error) {
    if (error.code === "23505") return { error: "이미 존재하는 부서 이름입니다." };
    return { error: error.message };
  }
  revalidatePath("/admin/departments");
  revalidatePath("/admin/budget");
  return {};
}

export async function setDepartmentActive(input: {
  id: number;
  isActive: boolean;
}): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  if (!input.isActive) {
    const { count } = await auth.supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("department_id", input.id)
      .eq("is_active", true);
    if ((count ?? 0) > 0) {
      return {
        error: "이 부서에 소속된 활성 사용자가 있습니다. 먼저 사용자 소속을 옮긴 뒤 비활성화해 주세요.",
      };
    }
  }

  const { error } = await auth.supabase
    .from("departments")
    .update({ is_active: input.isActive })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/departments");
  revalidatePath("/admin/budget");
  return {};
}

export async function createTeam(input: {
  departmentId: number;
  code: string;
  name: string;
  sortOrder: number;
}): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const code = normalizeCode(input.code);
  const name = input.name.trim();
  if (!code || !name) return { error: "팀 코드와 이름을 입력해 주세요." };

  const { error } = await auth.supabase.from("teams").insert({
    department_id: input.departmentId,
    code,
    name,
    sort_order: input.sortOrder,
    is_active: true,
  });
  if (error) {
    if (error.code === "23505") return { error: "이미 존재하는 팀 코드 또는 이름입니다." };
    return { error: error.message };
  }
  revalidatePath("/admin/departments");
  return {};
}

export async function renameTeam(input: {
  id: number;
  name: string;
  sortOrder: number;
}): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const name = input.name.trim();
  if (!name) return { error: "팀 이름을 입력해 주세요." };

  const { error } = await auth.supabase
    .from("teams")
    .update({ name, sort_order: input.sortOrder })
    .eq("id", input.id);
  if (error) {
    if (error.code === "23505") return { error: "이미 존재하는 팀 이름입니다." };
    return { error: error.message };
  }
  revalidatePath("/admin/departments");
  return {};
}

export async function setTeamActive(input: {
  id: number;
  isActive: boolean;
}): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase
    .from("teams")
    .update({ is_active: input.isActive })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/departments");
  return {};
}
