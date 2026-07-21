import React from 'react';

const TYPE_COLOR = {
  '수입': 'text-emerald-600',
  '고정지출': 'text-rose-600',
  '변동필수': 'text-orange-600',
  '부채상환': 'text-red-600',
  '선택지출': 'text-yellow-600',
  '저축': 'text-blue-600',
};

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export default function TransactionList({ items, onEdit, onDelete, bare = false }) {
  if (!items.length) {
    return <div className="text-slate-500 text-center py-10 text-sm">거래 내역이 없습니다.</div>;
  }

  return (
    <div className={bare ? 'overflow-hidden' : 'bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden'}>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="border-b border-slate-200">
            <th className="text-left px-4 py-3 text-slate-500 font-medium">날짜</th>
            <th className="text-left px-4 py-3 text-slate-500 font-medium">카테고리</th>
            <th className="text-left px-4 py-3 text-slate-500 font-medium hidden md:table-cell">가맹점</th>
            <th className="text-right px-4 py-3 text-slate-500 font-medium">금액</th>
            <th className="text-left px-4 py-3 text-slate-500 font-medium hidden sm:table-cell">결제수단</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((tx, i) => (
            <tr
              key={tx.id}
              className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                i % 2 === 0 ? '' : 'bg-slate-50/50'
              }`}
            >
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{tx.date}</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-medium ${TYPE_COLOR[tx.major_type] || 'text-slate-600'}`}>
                  {tx.category_name}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600 hidden md:table-cell max-w-xs truncate">
                {tx.merchant || <span className="text-slate-300">—</span>}
              </td>
              <td className={`px-4 py-3 text-right font-medium tabular-nums ${
                tx.major_type === '수입' ? 'text-emerald-600' : 'text-slate-800'
              }`}>
                {tx.major_type === '수입' ? '+' : '-'}{fmt(tx.amount)}
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">
                {tx.payment_method_name || '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => onEdit(tx)}
                    className="text-slate-400 hover:text-indigo-600 transition-colors text-xs"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => onDelete(tx.id)}
                    className="text-slate-400 hover:text-rose-600 transition-colors text-xs"
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
