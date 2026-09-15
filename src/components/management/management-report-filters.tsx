'use client';

import {useMemo, useState, useTransition} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {CalendarDays, RotateCcw} from 'lucide-react';
import styles from '@/app/(protected)/management/reports/management-reports.module.css';

type DepartmentOption = {
  id: string;
  name: string;
};

type EmployeeOption = {
  id: string;
  name: string;
  departmentId: string | null;
};

type FilterValues = {
  from: string;
  to: string;
  departmentId: string;
  userId: string;
};

export function ManagementReportFilters({
  from,
  to,
  departmentId,
  userId,
  departments,
  employees,
}: {
  from: string;
  to: string;
  departmentId: string;
  userId: string;
  departments: DepartmentOption[];
  employees: EmployeeOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<FilterValues>({from, to, departmentId, userId});

  const visibleEmployees = useMemo(
    () => employees.filter((employee) => !values.departmentId || employee.departmentId === values.departmentId),
    [employees, values.departmentId],
  );

  function navigate(next: FilterValues) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ['from', 'to', 'departmentId', 'userId', 'teamId', 'role', 'q', 'status', 'taskStatus']) {
      params.delete(key);
    }
    params.set('from', next.from);
    params.set('to', next.to);
    if (next.departmentId) params.set('departmentId', next.departmentId);
    if (next.userId) params.set('userId', next.userId);
    startTransition(() => router.replace(pathname + '?' + params.toString(), {scroll: false}));
  }

  function update(key: keyof FilterValues, value: string) {
    const next = {...values, [key]: value};
    if (key === 'departmentId') {
      const selectedEmployee = employees.find((employee) => employee.id === next.userId);
      if (selectedEmployee && value && selectedEmployee.departmentId !== value) next.userId = '';
    }
    setValues(next);
    navigate(next);
  }

  function reset() {
    const next = {from, to, departmentId: '', userId: ''};
    setValues(next);
    const params = new URLSearchParams();
    params.set('from', from);
    params.set('to', to);
    startTransition(() => router.replace(pathname + '?' + params.toString(), {scroll: false}));
  }

  return (
    <div className={styles.filters} aria-busy={isPending}>
      <div className={styles.filterIntro}>
        <CalendarDays size={16} />
        <strong>Report filters</strong>
        <span>{isPending ? 'Updating report...' : 'Changes update the report automatically.'}</span>
      </div>
      <label>
        From
        <input type="date" value={values.from} onChange={(event) => update('from', event.target.value)} />
      </label>
      <label>
        To
        <input type="date" value={values.to} onChange={(event) => update('to', event.target.value)} />
      </label>
      <label>
        Department
        <select value={values.departmentId} onChange={(event) => update('departmentId', event.target.value)}>
          <option value="">All departments</option>
          {departments.map((department) => (
            <option value={department.id} key={department.id}>{department.name}</option>
          ))}
        </select>
      </label>
      <label>
        Employee
        <select value={values.userId} onChange={(event) => update('userId', event.target.value)}>
          <option value="">All employees</option>
          {visibleEmployees.map((employee) => (
            <option value={employee.id} key={employee.id}>{employee.name}</option>
          ))}
        </select>
      </label>
      <button
        className={styles.reset}
        type="button"
        onClick={reset}
        disabled={isPending || (!values.departmentId && !values.userId)}
      >
        <RotateCcw size={13} />
        Reset
      </button>
    </div>
  );
}
