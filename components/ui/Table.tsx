import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export default function Table<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "표시할 데이터가 없습니다.",
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2.5 font-medium whitespace-nowrap text-slate-500 ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-10 text-center text-slate-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-3 text-slate-700 ${col.className ?? ""}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
