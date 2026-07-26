import React, { useRef } from 'react';
import CategoryBadge from './CategoryBadge';
import { AMOUNT_MARK } from '../lib/categoryStyle';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export default function TransactionList({ items, onEdit, onDelete, bare = false, selectedIds, onToggleSelect, onToggleSelectAll }) {
  if (!items.length) {
    return <div className="text-ink-subtle text-center py-10 text-sm">거래 내역이 없습니다.</div>;
  }

  const selectable = !!(selectedIds && onToggleSelect);
  const allSelected = selectable && items.every(tx => selectedIds.has(tx.id));

  const lastCheckedIndexRef = useRef(null);

  const handleCheckboxChange = (e, id, index) => {
    const shiftKey = e.nativeEvent.shiftKey;
    if (shiftKey && lastCheckedIndexRef.current !== null && onToggleSelectAll) {
      const start = Math.min(lastCheckedIndexRef.current, index);
      const end = Math.max(lastCheckedIndexRef.current, index);
      const rangeIds = items.slice(start, end + 1).map(tx => tx.id);
      onToggleSelectAll(rangeIds, e.target.checked);
    } else {
      onToggleSelect(id);
    }
    lastCheckedIndexRef.current = index;
  };

  return (
    <div className={bare ? 'overflow-hidden' : 'bg-surface shadow-card rounded-card border border-line overflow-hidden'}>
      <table className="w-full text-sm">
        <thead className="bg-surface-muted">
          <tr className="border-b border-line">
            {selectable && (
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={allSelected}
                  onChange={() => onToggleSelectAll?.(items.map(tx => tx.id), !allSelected)}
                  className="cursor-pointer"
                />
              </th>
            )}
            <th className="text-left px-4 py-3 text-ink-subtle font-medium">날짜</th>
            <th className="text-left px-4 py-3 text-ink-subtle font-medium">카테고리</th>
            <th className="text-left px-4 py-3 text-ink-subtle font-medium hidden md:table-cell">가맹점</th>
            <th className="text-right px-4 py-3 text-ink-subtle font-medium">금액</th>
            <th className="text-left px-4 py-3 text-ink-subtle font-medium hidden sm:table-cell">결제수단</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((tx, i) => (
            <tr
              key={tx.id}
              className={`border-b border-line-soft hover:bg-surface-muted transition-colors ${
                i % 2 === 0 ? '' : 'bg-surface-muted/50'
              } ${selectable && selectedIds.has(tx.id) ? 'bg-accent-soft/60' : ''}`}
            >
              {selectable && (
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`${tx.date} ${tx.merchant || tx.category_name} 거래 선택`}
                    checked={selectedIds.has(tx.id)}
                    onChange={(e) => handleCheckboxChange(e, tx.id, i)}
                    className="cursor-pointer"
                  />
                </td>
              )}
              <td className="px-4 py-3 text-ink-subtle whitespace-nowrap">{tx.date}</td>
              <td className="px-4 py-3">
                <CategoryBadge
                  majorType={tx.major_type}
                  name={tx.category_name}
                  className="text-xs font-medium max-w-[10rem]"
                />
              </td>
              <td className="px-4 py-3 text-ink-muted hidden md:table-cell max-w-xs truncate">
                {tx.merchant || <span className="text-ink-ghost">—</span>}
              </td>
              <td className={`px-4 py-3 text-right font-medium tabular-nums ${
                tx.major_type === '수입' ? 'text-income' : 'text-ink'
              }`}>
                <span aria-hidden="true" className="mr-0.5 text-[10px] align-middle">
                  {tx.major_type === '수입' ? AMOUNT_MARK.income.arrow : AMOUNT_MARK.expense.arrow}
                </span>
                {tx.major_type === '수입' ? AMOUNT_MARK.income.sign : AMOUNT_MARK.expense.sign}{fmt(tx.amount)}
              </td>
              <td className="px-4 py-3 text-ink-faint text-xs hidden sm:table-cell">
                {tx.payment_method_name || '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => onEdit(tx)}
                    className="text-ink-faint hover:text-accent transition-colors text-xs"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => onDelete(tx.id)}
                    className="text-ink-faint hover:text-expense transition-colors text-xs"
                  >
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
