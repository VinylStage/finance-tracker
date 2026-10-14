import React from 'react';
import { formatWon } from '../lib/format';

export default function AdvisorNetWorthTable({ rows }) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return (
    <section aria-label="순자산 전망" className="bg-surface shadow-card rounded-card p-5 border border-line space-y-3">
      <h2 className="text-sm font-semibold text-body">순자산 전망</h2>
      <p className="text-caption text-xs">현금잔액 + 적금누적 − 부채 · 적금 이자와 대출 원금상환은 반영하지 않음</p>
      <div className="max-h-64 overflow-auto border border-line rounded-card">
        <table data-testid="networth-table" className="w-full text-xs tabular-nums">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left">월</th>
              <th className="px-2 py-1 text-left">현금</th>
              <th className="px-2 py-1 text-left">적금</th>
              <th className="px-2 py-1 text-left">부채</th>
              <th className="px-2 py-1 text-left">순자산</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <td className="px-2 py-1">{r.month}</td>
                <td className="px-2 py-1">{formatWon(r.cash)}</td>
                <td className="px-2 py-1">{formatWon(r.savings)}</td>
                <td className="px-2 py-1">{formatWon(r.debt)}</td>
                <td 
                  className={`px-2 py-1 ${r.netWorth < 0 ? 'text-loss-text font-semibold' : 'text-ink'}`}
                  data-testid={`networth-${r.month}`}
                >
                  {formatWon(r.netWorth)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
