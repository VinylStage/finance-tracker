import React from 'react';

export default function CsvInvalidRows({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return (
    <details data-testid="csv-invalid-rows" className="text-xs bg-surface-page border border-line rounded-control px-4 py-3">
      <summary className="cursor-pointer text-body">제외된 행 {rows.length}건 보기</summary>
      <ul className="mt-2 space-y-1">
        {rows.map((r) => (
          <li key={r.line} className="text-caption">
            <span className="font-medium text-body">{r.line}행</span> · {r.reason}
            <code className="block break-all text-caption">{r.raw}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}
