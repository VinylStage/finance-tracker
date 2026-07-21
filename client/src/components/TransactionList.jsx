import React from 'react';

const TYPE_COLOR = {
  '수입': 'text-emerald-400',
  '고정지출': 'text-rose-400',
  '변동필수': 'text-orange-400',
  '부채상환': 'text-red-400',
  '선택지출': 'text-yellow-400',
  '저축': 'text-blue-400',
};

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export default function TransactionList({ items, onEdit, onDelete }) {
  if (!items.length) {
    return <div className="text-gray-500 text-center py-10">거래 내역이 없습니다.</div>;
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-750">
          <tr className="border-b border-gray-700">
            <th className="text-left px-4 py-3 text-gray-400 font-medium">날짜</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium">카테고리</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium hidden md:table-cell">가맹점</th>
            <th className="text-right px-4 py-3 text-gray-400 font-medium">금액</th>
            <th className="text-left px-4 py-3 text-gray-400 font-medium hidden sm:table-cell">결제수단</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((tx, i) => (
            <tr
              key={tx.id}
              className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${
                i % 2 === 0 ? '' : 'bg-gray-800/50'
              }`}
            >
              <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{tx.date}</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-medium ${TYPE_COLOR[tx.major_type] || 'text-gray-300'}`}>
                  {tx.category_name}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-300 hidden md:table-cell max-w-xs truncate">
                {tx.merchant || <span className="text-gray-600">—</span>}
              </td>
              <td className={`px-4 py-3 text-right font-medium tabular-nums ${
                tx.major_type === '수입' ? 'text-emerald-400' : 'text-gray-100'
              }`}>
                {tx.major_type === '수입' ? '+' : '-'}{fmt(tx.amount)}
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                {tx.payment_method_name || '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => onEdit(tx)}
                    className="text-gray-500 hover:text-indigo-400 transition-colors text-xs"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => onDelete(tx.id)}
                    className="text-gray-500 hover:text-rose-400 transition-colors text-xs"
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
