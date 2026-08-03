import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { derivedEndpoint } from '../lib/derivedOrigin';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

// 이 항목이 만든 거래들(#270).
//
// 부채관리 화면에 이 목록이 있어야 "원본을 고치면 거래가 따라 바뀐다" 가 눈에
// 보인다. 거래내역에서는 고칠 수 없다고만 알려주고 끝나면, 사용자는 그 거래가
// 어디서 왔는지 확인할 자리가 없다.
//
// 펼쳤을 때만 부른다. 항목마다 미리 부르면 목록 한 번 여는 데 요청이 항목 수만큼 난다.
export default function DerivedTransactions({ kind, id }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get(derivedEndpoint(kind, id))
      .then((res) => { if (alive) setRows(res.data || []); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [kind, id]);

  if (error) return <p role="alert" className="text-xs text-loss-text py-2">{error}</p>;
  if (rows === null) return <p className="text-xs text-caption py-2">불러오는 중...</p>;

  if (!rows.length) {
    return (
      <p className="text-xs text-caption py-2">
        아직 만들어진 거래가 없어요. 등록하면 청구 회차가 거래내역에 자동으로 들어가요.
      </p>
    );
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="py-2">
      <h4 className="text-xs font-medium text-caption mb-1">
        이 항목이 만든 거래 {rows.length}건 · 합계 {fmt(total)}
      </h4>
      <ul className="divide-y divide-line-faint">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
            <span className="text-caption whitespace-nowrap">{r.date}</span>
            <span className="text-body truncate flex-1">{r.memo || r.merchant}</span>
            <span className="text-ink tabular-nums whitespace-nowrap">{fmt(r.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-caption mt-1.5">
        이 거래들은 거래내역에서 직접 고칠 수 없어요. 여기서 원본을 고치면 함께 바뀝니다.
      </p>
    </div>
  );
}
