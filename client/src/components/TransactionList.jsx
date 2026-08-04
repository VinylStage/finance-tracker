import React, { useRef } from 'react';
import CategoryBadge from './CategoryBadge';
import DerivedBadge from './DerivedBadge';
import { AMOUNT_MARK } from '../lib/categoryStyle';
import { isDerived } from '../lib/derivedOrigin';
import { formatWon } from '../lib/format';


export default function TransactionList({ items, onEdit, onDelete, onMakeRecurring, bare = false, selectedIds, onToggleSelect, onToggleSelectAll }) {
  const lastCheckedIndexRef = useRef(null);

  if (!items.length) {
    return <div className="text-caption text-center py-10 text-sm">거래 내역이 없습니다.</div>;
  }

  const selectable = !!(selectedIds && onToggleSelect);

  // 파생 거래는 일괄 선택에서 아예 뺀다(#270). 선택은 되는데 삭제만 실패하면
  // 사용자는 왜 안 됐는지 알 방법이 없다 — 서버는 이미 잠갔으므로(#268)
  // 고르게 두는 것 자체가 잘못된 약속이다.
  const selectableItems = items.filter((tx) => !isDerived(tx));
  const allSelected = selectable
    && selectableItems.length > 0
    && selectableItems.every((tx) => selectedIds.has(tx.id));

  const handleCheckboxChange = (e, id, index) => {
    const shiftKey = e.nativeEvent.shiftKey;
    if (shiftKey && lastCheckedIndexRef.current !== null && onToggleSelectAll) {
      const start = Math.min(lastCheckedIndexRef.current, index);
      const end = Math.max(lastCheckedIndexRef.current, index);
      // 범위 선택도 마찬가지다. 사이에 낀 파생 거래까지 집어 오면 안 된다.
      const rangeIds = items.slice(start, end + 1).filter((tx) => !isDerived(tx)).map((tx) => tx.id);
      onToggleSelectAll(rangeIds, e.target.checked);
    } else {
      onToggleSelect(id);
    }
    lastCheckedIndexRef.current = index;
  };

  return (
    <div className={bare ? 'overflow-hidden' : 'bg-surface shadow-card rounded-card border border-line overflow-hidden'}>
      <table className="w-full text-sm tx-table" role="table">
        <thead className="bg-surface-page" role="rowgroup">
          <tr className="border-b border-line" role="row">
            {selectable && (
              <th className="px-4 py-3 w-8" role="columnheader" scope="col">
                <input
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={allSelected}
                  onChange={() => onToggleSelectAll?.(selectableItems.map(tx => tx.id), !allSelected)}
                  className="cursor-pointer"
                />
              </th>
            )}
            <th className="text-left px-4 py-3 text-caption font-medium" role="columnheader" scope="col">날짜</th>
            <th className="text-left px-4 py-3 text-caption font-medium" role="columnheader" scope="col">카테고리</th>
            <th className="text-left px-4 py-3 text-caption font-medium" role="columnheader" scope="col">가맹점</th>
            <th className="text-right px-4 py-3 text-caption font-medium" role="columnheader" scope="col">금액</th>
            <th className="text-left px-4 py-3 text-caption font-medium" role="columnheader" scope="col">결제수단</th>
            <th className="px-4 py-3" role="columnheader" scope="col"><span className="sr-only">작업</span></th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {items.map((tx, i) => (
            <tr
              key={tx.id}
              role="row"
              className={`border-b border-line-faint hover:bg-surface-page transition-colors ${
                i % 2 === 0 ? '' : 'bg-surface-page/50'
              } ${selectable && selectedIds.has(tx.id) ? 'bg-brand-tint/60' : ''}`}
            >
              {selectable && (
                <td className="px-4 py-3" role="cell" data-label="">
                  {!isDerived(tx) && (
                    <input
                      type="checkbox"
                      aria-label={`${tx.date} ${tx.merchant || tx.category_name} 거래 선택`}
                      checked={selectedIds.has(tx.id)}
                      onChange={(e) => handleCheckboxChange(e, tx.id, i)}
                      className="cursor-pointer"
                    />
                  )}
                </td>
              )}
              <td className="px-4 py-3 text-caption whitespace-nowrap" role="cell" data-label="날짜">{tx.date}</td>
              <td className="px-4 py-3" role="cell" data-label="카테고리">
                <CategoryBadge
                  majorType={tx.major_type}
                  name={tx.category_name}
                  className="text-xs font-medium max-w-[10rem]"
                />
              </td>
              <td className="px-4 py-3 text-body max-w-xs truncate" role="cell" data-label="가맹점">
                {tx.merchant || <span className="text-disabled">—</span>}
              </td>
              <td className={`px-4 py-3 text-right font-medium tabular-nums ${
                tx.major_type === '수입' ? 'text-brand-text' : 'text-ink'
              }`} role="cell" data-label="금액">
                <span aria-hidden="true" className="mr-0.5 text-[10px] align-middle">
                  {tx.major_type === '수입' ? AMOUNT_MARK.income.arrow : AMOUNT_MARK.expense.arrow}
                </span>
                {tx.major_type === '수입' ? AMOUNT_MARK.income.sign : AMOUNT_MARK.expense.sign}{formatWon(tx.amount)}
              </td>
              <td className="px-4 py-3 text-caption text-xs" role="cell" data-label="결제수단">
                {tx.payment_method_name || '—'}
              </td>
              <td className="px-4 py-3" role="cell" data-label="">
                {/* 파생 거래에는 수정·삭제 버튼을 비활성으로 두지 않고 아예
                    렌더하지 않는다. 비활성 버튼은 누를 수 있는 것처럼 보이면서
                    이유도 알려주지 않는다(#270). */}
                <div className="flex gap-2 justify-end items-center">
                  {isDerived(tx) ? (
                    <DerivedBadge tx={tx} />
                  ) : (
                    <>
                      <button
                        onClick={() => onEdit(tx)}
                        className="text-caption hover:text-brand-text transition-colors text-xs"
                      >
                        수정
                      </button>
                      {/* 매달 같은 곳에 같은 금액을 내는 것이 고정지출이므로,
                          실제로 낸 거래가 곧 반복 규칙의 템플릿이다(#280). */}
                      {onMakeRecurring && (
                        <button
                          onClick={() => onMakeRecurring(tx)}
                          className="text-caption hover:text-brand-text transition-colors text-xs"
                        >
                          반복으로
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(tx.id)}
                        className="text-caption hover:text-loss-text transition-colors text-xs"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
