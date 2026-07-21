import React, { useEffect, useState } from 'react';

function StatCard({ label, value, sub, color = 'text-slate-800' }) {
  return (
    <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
      <p className="text-slate-500 text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/transactions/summary/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500 text-center py-20">로딩 중...</div>;
  if (!data) return <div className="text-rose-600 text-center py-20">데이터를 불러올 수 없습니다.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">{data.thisMonth} 대시보드</h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="이번달 수입" value={fmt(data.income)} color="text-emerald-600" />
        <StatCard label="이번달 지출" value={fmt(data.expense)} color="text-rose-600" />
        <StatCard
          label="가용 현금"
          value={fmt(data.available)}
          sub={`할부 청구 예정 ${fmt(data.installmentsDue)} 제외`}
          color={data.available >= 0 ? 'text-indigo-600' : 'text-rose-600'}
        />
      </div>

      {/* 예산 대비 실적 */}
      {data.budgets && data.budgets.length > 0 && (
        <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">예산 대비 실적</h2>
          <div className="space-y-3">
            {data.budgets.map(b => {
              const pct = Math.min(100, Math.round((b.spent / b.monthly_budget) * 100));
              const over = b.spent > b.monthly_budget;
              return (
                <div key={b.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">{b.name}</span>
                    <span className={over ? 'text-rose-600' : 'text-slate-600'}>
                      {fmt(b.spent)} / {fmt(b.monthly_budget)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full">
                    <div
                      className={`h-1.5 rounded-full ${over ? 'bg-rose-500' : 'bg-indigo-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
