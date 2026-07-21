import React, { useEffect, useState, useCallback } from 'react';

const CATEGORY_TYPES = ['수입', '고정지출', '변동필수', '부채상환', '선택지출', '저축'];
const PAYMENT_TYPES = ['신용', '체크', '이체', '현금성', '간편결제'];

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export default function Settings() {
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [appSettings, setAppSettings] = useState({ initial_balance: 0, monthly_income: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/payment-methods').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(([cats, pms, settings]) => {
      setCategories(cats);
      setPaymentMethods(pms);
      setAppSettings(settings);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-slate-500 text-center py-20">로딩 중...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">설정</h1>
      <AppSettingsSection initial={appSettings} onSaved={load} />
      <CategorySection categories={categories} onChanged={load} />
      <PaymentMethodSection paymentMethods={paymentMethods} onChanged={load} />
      <ExportSection />
    </div>
  );
}

const inp = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500';

function AppSettingsSection({ initial, onSaved }) {
  const [form, setForm] = useState({
    initial_balance: String(initial.initial_balance || 0),
    monthly_income: String(initial.monthly_income || 0),
  });
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initial_balance: Number(form.initial_balance),
        monthly_income: Number(form.monthly_income),
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">기본 설정</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">초기 잔액 (원)</label>
          <input type="number" className={inp} value={form.initial_balance} onChange={e => setForm(f => ({ ...f, initial_balance: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">월 수입 기준값 (원)</label>
          <input type="number" className={inp} value={form.monthly_income} onChange={e => setForm(f => ({ ...f, monthly_income: e.target.value }))} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2 rounded-lg transition-colors">저장</button>
        {saved && <span className="text-xs text-emerald-600">저장됨</span>}
      </div>
    </form>
  );
}

function CategorySection({ categories, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ major_type: '선택지출', name: '', monthly_budget: '' });

  const handleAdd = async (e) => {
    e.preventDefault();
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, monthly_budget: Number(form.monthly_budget) || 0 }),
    });
    setForm({ major_type: '선택지출', name: '', monthly_budget: '' });
    setShowForm(false);
    onChanged();
  };

  const handleBudgetChange = async (cat, value) => {
    await fetch(`/api/categories/${cat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cat, monthly_budget: Number(value) || 0 }),
    });
    onChanged();
  };

  const handleDeactivate = async (id) => {
    if (!confirm('비활성화하시겠습니까?')) return;
    await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">카테고리 관리</h2>
        <button onClick={() => setShowForm(s => !s)} className="text-xs text-indigo-600 hover:text-indigo-700">+ 추가</button>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end bg-slate-50 rounded-lg p-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">유형</label>
            <select className={inp} value={form.major_type} onChange={e => setForm(f => ({ ...f, major_type: e.target.value }))}>
              {CATEGORY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">이름</label>
            <input type="text" className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">월 예산</label>
            <input type="number" className={inp} placeholder="0" value={form.monthly_budget} onChange={e => setForm(f => ({ ...f, monthly_budget: e.target.value }))} />
          </div>
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">추가</button>
        </form>
      )}
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr className="border-b border-slate-200">
              <th className="text-left px-3 py-2 text-slate-500 font-medium">유형</th>
              <th className="text-left px-3 py-2 text-slate-500 font-medium">이름</th>
              <th className="text-right px-3 py-2 text-slate-500 font-medium">월 예산</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map(c => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-500 text-xs">{c.major_type}</td>
                <td className="px-3 py-2 text-slate-800">{c.name}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number" defaultValue={c.monthly_budget}
                    onBlur={e => handleBudgetChange(c, e.target.value)}
                    className="w-24 bg-white border border-slate-300 rounded px-2 py-1 text-right text-xs"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => handleDeactivate(c.id)} className="text-slate-400 hover:text-rose-600 text-xs">비활성화</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentMethodSection({ paymentMethods, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: '신용' });

  const handleAdd = async (e) => {
    e.preventDefault();
    await fetch('/api/payment-methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ name: '', type: '신용' });
    setShowForm(false);
    onChanged();
  };

  const handleDeactivate = async (id) => {
    if (!confirm('비활성화하시겠습니까?')) return;
    await fetch(`/api/payment-methods/${id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">결제수단 관리</h2>
        <button onClick={() => setShowForm(s => !s)} className="text-xs text-indigo-600 hover:text-indigo-700">+ 추가</button>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end bg-slate-50 rounded-lg p-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">이름</label>
            <input type="text" className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">유형</label>
            <select className={inp} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">추가</button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {paymentMethods.map(p => (
          <span key={p.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full pl-3 pr-1 py-1 text-xs text-slate-600">
            {p.name} <span className="text-slate-400">({p.type})</span>
            <button onClick={() => handleDeactivate(p.id)} className="text-slate-400 hover:text-rose-600 px-1.5 py-0.5 rounded-full hover:bg-rose-50">✕</button>
          </span>
        ))}
      </div>
    </div>
  );
}

function ExportSection() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const handleExport = (format) => {
    const params = new URLSearchParams({ format });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    window.location.href = `/api/export?${params.toString()}`;
  };

  return (
    <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">데이터 내보내기</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">시작일 (CSV, 선택)</label>
          <input type="date" className={inp} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">종료일 (CSV, 선택)</label>
          <input type="date" className={inp} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button onClick={() => handleExport('csv')} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">CSV 다운로드 (거래내역)</button>
        <button onClick={() => handleExport('json')} className="text-slate-600 hover:text-slate-800 border border-slate-300 text-sm px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">JSON 다운로드 (전체 백업)</button>
      </div>
    </div>
  );
}
