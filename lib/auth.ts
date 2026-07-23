import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  departmentId: number;
  departmentName: string;
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, email, name, role, department_id, departments(name)")
    .eq("id", user.id)
    .single();
  if (!data) return null;

  const dept = data.departments as unknown as { name: string } | null;
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role as UserRole,
    departmentId: data.department_id,
    departmentName: dept?.name ?? "",
  };
});
