
import type { ReactNode } from "react";

export interface TableColumn {
  key: string;
  label: string;
  render?: (row: Record<string, ReactNode>) => ReactNode;
}

export interface TableProps {
  columns: TableColumn[];
  rows: Array<Record<string, ReactNode>>;
  emptyMessage?: string;
  rowKey?: string;
}

export default function Table({
  columns,
  rows,
  emptyMessage = "No hay registros para mostrar.",
  rowKey = "id",
}: TableProps) {
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
        }}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{
                  padding: 12,
                  background: "#f3f4f6",
                  borderBottom: "1px solid #d1d5db",
                }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={Math.max(columns.length, 1)}
                style={{ padding: 20, textAlign: "center" }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const identifier = row[rowKey];

              return (
                <tr
                  key={
                    typeof identifier === "string" ||
                    typeof identifier === "number"
                      ? identifier
                      : index
                  }
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      style={{
                        padding: 12,
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {column.render
                        ? column.render(row)
                        : row[column.key]}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
