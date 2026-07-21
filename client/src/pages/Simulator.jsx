import React, { useEffect, useState, useMemo } from 'react';
import {
  LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

function shortFmt(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 10000) return `${Math.round(v / 10000)}만`;
  return v.toLocaleString('ko-KR');
}

export default function Simulator() {
  const [startingBalance, setStartingBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    income: '',
    expense: '',
    debtPayment: '',
    savings: '',
    months: '12',
  });

  useEffect(() => {
    fetch('/api/transactions/summary/dashboard')
      .then(r => r.json())
      .then(d => { setStartingBalance(d.available || 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const projection = useMemo(() => {
    const income = Number(form.income) || 0;
    const expense = Number(form.expense) || 0;
    const debtPayment = Number(form.debtPayment) || 0;
    const savings = Number(form.savings) || 0;
    const months = Math.max(1, Number(form.months) || 12);
    const netMonthly = income - expense - debtPayment - savings;

    const rows = [];
    let balance = startingBalance;
    rows.push({ month: 0, label: '현재', balance });
    for (let i = 1; i <= months; i++) {
      balance += netMonthly;
      rows.push({ month: i, label: `${i}개월 후`, balance });
    }
    return rows;
  }, [form, startingBalance]);

  const finalBalance = projection[projection.length - 1]?.balance ?? startingBalance;

  const inp = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">예상잔액 시뮬레이터</h1>

      {loading ? (
        <div className="text-slate-500 text-center py-10">로딩 중...</div>
      ) : (
        <>
          <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">가정값 입력</h2>
              <span className="text-xs text-slate-400">현재 가용현금: <span className="text-slate-700 font-medium">{fmt(startingBalance)}</span></span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">월 수입 (원)</label>
                <input type="number" className={inp} placeholder="0" value={form.income} onChange={e => set('income', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">월 지출/고정비 (원)</label>
                <input type="number" className={inp} placeholder="0" value={form.expense} onChange={e => set('expense', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">부채상환 (원)</label>
                <input type="number" className={inp} placeholder="0" value={form.debtPayment} onChange={e => set('debtPayment', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">저축 (원)</label>
                <input type="number" className={inp} placeholder="0" value={form.savings} onChange={e => set('savings', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">기간 (개월)</label>
                <input type="number" min="1" className={inp} value={form.months} onChange={e => set('months', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
              <p className="text-slate-500 text-sm mb-1">현재 가용현금</p>
              <p className="text-2xl font-bold text-slate-800">{fmt(startingBalance)}</p>
            </div>
            <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
              <p className="text-slate-500 text-sm mb-1">{form.months}개월 후 예상잔액</p>
              <p className={`text-2xl font-bold ${finalBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>{fmt(finalBalance)}</p>
            </div>
          </div>

          <div className="bg-white shadow-sm rounded-xl p-5 border border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">잔액 추이</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={projection}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={Math.ceil(projection.length / 12)} />
                <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Line type="monotone" dataKey="balance" name="예상잔액" stroke="#4f46e5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">시점</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">예상잔액</th>
                </tr>
              </thead>
              <tbody>
                {projection.map((r, i) => (
                  <tr key={r.month} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                    <td className="px-4 py-3 text-slate-600">{r.label}</td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums ${r.balance >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{fmt(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
