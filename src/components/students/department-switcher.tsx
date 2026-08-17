"use client";

import { useRouter } from "next/navigation";

export function DepartmentSwitcher({
  departments,
  activeId,
}: {
  departments: { id: string; name: string }[];
  activeId: string;
}) {
  const router = useRouter();
  return (
    <select
      className="admin-input max-w-xs"
      value={activeId}
      onChange={(e) => router.push(`/students?departmentId=${e.target.value}`)}
    >
      {departments.map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </select>
  );
}
