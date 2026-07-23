"use server";

import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface UpdateBudgetInput {
  year: number;
  sales1: number;
  sales2: number;
  sales3: number;
  common: number;
  reason: string;
}

export async function updateAnnualBudget(
  input: UpdateBudgetInput,
): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile || profile.role !== "SUPPORT_ADMIN") {
    return { error: "관리자만 예산을 관리할 수 있습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_annual_budget", {
    p_year: input.year,
    p_sales1_amount: input.sales1,
    p_sales2_amount: input.sales2,
    p_sales3_amount: input.sales3,
    p_common_amount: input.common,
    p_reason: input.reason,
  });
  if (error) return { error: error.message };
  return {};
}

export interface AllocateTeamBudgetsInput {
  year: number;
  departmentId: number;
  allocations: { teamId: number; amount: number }[];
  reason: string;
}

export async function allocateTeamBudgets(
  input: AllocateTeamBudgetsInput,
): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile || profile.role !== "SUPPORT_ADMIN") {
    return { error: "관리자만 예산을 관리할 수 있습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_team_budgets", {
    p_year: input.year,
    p_department_id: input.departmentId,
    p_team_ids: input.allocations.map((a) => a.teamId),
    p_amounts: input.allocations.map((a) => a.amount),
    p_reason: input.reason,
  });
  if (error) return { error: error.message };
  return {};
}
