import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function DataTable({ columns, rows, emptyMessage = 'No records found.' }) {
  if (!rows?.length) {
    return (
      <div className="portal-empty-table glass-panel">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="members-table portal-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusIcon({ status }) {
  const normalized = (status || 'Paid').toLowerCase();
  if (normalized.includes('paid') || normalized.includes('complete') || normalized.includes('active')) {
    return <CheckCircle2 size={16} className="text-success" aria-label={status} />;
  }
  return null;
}
