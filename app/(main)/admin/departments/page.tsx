import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/ui/Card";
import { NewDepartmentForm, DepartmentRow } from "@/components/admin/DepartmentForm";
import { NewTeamForm, TeamRow } from "@/components/admin/TeamForm";
import { createClient } from "@/lib/supabase/server";

interface DeptRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

interface TeamRowData {
  id: number;
  department_id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export default async function DepartmentsPage() {
  const supabase = await createClient();

  const [{ data: deptData }, { data: teamData }] = await Promise.all([
    supabase
      .from("departments")
      .select("id, code, name, is_active")
      .eq("dept_type", "SALES")
      .order("id"),
    supabase
      .from("teams")
      .select("id, department_id, code, name, sort_order, is_active")
      .order("department_id")
      .order("sort_order"),
  ]);

  const departments = (deptData ?? []) as DeptRow[];
  const teams = (teamData ?? []) as TeamRowData[];

  return (
    <>
      <PageHeader
        title="부서/팀 관리"
        description="영업국(부서)과 소속 팀을 추가·개명·비활성화합니다. 조직 개편 시 이 화면에서 변경하면 예산 편성·신청 화면에 자동 반영됩니다."
      />

      <Card title="새 부서(영업국) 추가">
        <NewDepartmentForm />
      </Card>

      <div className="mt-6 space-y-6">
        {departments.map((dept) => {
          const deptTeams = teams.filter((t) => t.department_id === dept.id);
          const nextSortOrder =
            deptTeams.reduce((max, t) => Math.max(max, t.sort_order), 0) + 1;
          return (
            <Card key={dept.id} title={`${dept.name} · 소속 팀`}>
              <div className="mb-4">
                <DepartmentRow
                  id={dept.id}
                  code={dept.code}
                  name={dept.name}
                  isActive={dept.is_active}
                />
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                {deptTeams.length > 0 ? (
                  <div className="mb-3">
                    {deptTeams.map((t) => (
                      <TeamRow
                        key={t.id}
                        id={t.id}
                        code={t.code}
                        name={t.name}
                        sortOrder={t.sort_order}
                        isActive={t.is_active}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mb-3 text-sm text-slate-400">등록된 팀이 없습니다.</p>
                )}
                <NewTeamForm departmentId={dept.id} nextSortOrder={nextSortOrder} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
