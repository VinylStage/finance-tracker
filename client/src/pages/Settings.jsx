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
      <SettingsBackupSection />
      <TransactionsBackupSection />
      <CardImportSection />
      <DangerZoneSection />
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
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});

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

  const handleEditStart = (cat) => {
    setEditing(cat.id);
    setEditForm({ major_type: cat.major_type, name: cat.name, monthly_budget: cat.monthly_budget });
  };

  const handleEditCancel = () => {
    setEditing(null);
    setEditForm({});
  };

  const handleEditSave = async (cat) => {
    await fetch(`/api/categories/${cat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cat, ...editForm }),
    });
    setEditing(null);
    setEditForm({});
    onChanged();
  };

  const handleReActivate = async (id) => {
    if (!confirm('재활성화하시겠습니까?')) return;
    await fetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: 1 }),
    });
    onChanged();
  };

  const filteredCategories = showInactive 
    ? categories 
    : categories.filter(c => c.is_active);

  return (
    <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">카테고리 관리</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowForm(s => !s)} 
            className="text-xs text-indigo-600 hover:text-indigo-700"
          >
            + 추가
          </button>
          <button 
            onClick={() => setShowInactive(s => !s)} 
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {showInactive ? '활성 항목만 보기' : '비활성 항목 보기'}
          </button>
        </div>
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
            {filteredCategories.map(c => (
              <tr key={c.id} className={`border-b border-slate-100 ${!c.is_active ? 'opacity-50' : ''}`}>
                {editing === c.id ? (
                  <>
                    <td className="px-3 py-2">
                      <select 
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                        value={editForm.major_type}
                        onChange={e => setEditForm(f => ({ ...f, major_type: e.target.value }))}
                      >
                        {CATEGORY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        className="w-24 bg-white border border-slate-300 rounded px-2 py-1 text-right text-xs"
                        value={editForm.monthly_budget}
                        onChange={e => setEditForm(f => ({ ...f, monthly_budget: e.target.value }))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleEditSave(c)} className="text-xs text-indigo-600 hover:text-indigo-700 mr-2">저장</button>
                      <button onClick={handleEditCancel} className="text-xs text-slate-400 hover:text-slate-600">취소</button>
                    </td>
                  </>
                ) : (
                  <>
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
                      <button onClick={() => handleEditStart(c)} className="text-indigo-600 hover:text-indigo-700 text-xs mr-2">수정</button>
                      {c.is_active ? (
                        <button onClick={() => handleDeactivate(c.id)} className="text-slate-400 hover:text-rose-600 text-xs">비활성화</button>
                      ) : (
                        <button onClick={() => handleReActivate(c.id)} className="text-slate-400 hover:text-emerald-600 text-xs">재활성화</button>
                      )}
                    </td>
                  </>
                )}
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
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});

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

  const handleEditStart = (pm) => {
    setEditing(pm.id);
    setEditForm({ name: pm.name, type: pm.type });
  };

  const handleEditCancel = () => {
    setEditing(null);
    setEditForm({});
  };

  const handleEditSave = async (pm) => {
    await fetch(`/api/payment-methods/${pm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pm, ...editForm }),
    });
    setEditing(null);
    setEditForm({});
    onChanged();
  };

  const handleReActivate = async (id) => {
    if (!confirm('재활성화하시겠습니까?')) return;
    await fetch(`/api/payment-methods/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: 1 }),
    });
    onChanged();
  };

  const filteredPaymentMethods = showInactive 
    ? paymentMethods 
    : paymentMethods.filter(p => p.is_active);

  return (
    <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">결제수단 관리</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowForm(s => !s)} 
            className="text-xs text-indigo-600 hover:text-indigo-700"
          >
            + 추가
          </button>
          <button 
            onClick={() => setShowInactive(s => !s)} 
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {showInactive ? '활성 항목만 보기' : '비활성 항목 보기'}
          </button>
        </div>
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
        {filteredPaymentMethods.map(p => (
          <span key={p.id} className={`flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full pl-3 pr-1 py-1 text-xs ${!p.is_active ? 'opacity-50' : ''}`}>
            {editing === p.id ? (
              <>
                <input
                  type="text"
                  className="bg-white border border-slate-300 rounded px-2 py-1 text-xs w-16"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
                <select 
                  className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                  value={editForm.type}
                  onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                >
                  {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => handleEditSave(p)} className="text-xs text-indigo-600 hover:text-indigo-700 mr-1">저장</button>
                <button onClick={handleEditCancel} className="text-xs text-slate-400 hover:text-slate-600">취소</button>
              </>
            ) : (
              <>
                {p.name} <span className="text-slate-400">({p.type})</span>
                <div className="flex gap-1">
                  <button onClick={() => handleEditStart(p)} className="text-xs text-indigo-600 hover:text-indigo-700 px-1.5 py-0.5 rounded-full hover:bg-indigo-50">✏</button>
                  {p.is_active ? (
                    <button onClick={() => handleDeactivate(p.id)} className="text-slate-400 hover:text-rose-600 px-1.5 py-0.5 rounded-full hover:bg-rose-50">✕</button>
                  ) : (
                    <button onClick={() => handleReActivate(p.id)} className="text-slate-400 hover:text-emerald-600 px-1.5 py-0.5 rounded-full hover:bg-emerald-50">🔄</button>
                  )}
                </div>
              </>
            )}
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
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString();
    window.location.href = `/api/export/${format}${query ? `?${query}` : ''}`;
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

function SettingsBackupSection() {
  const [msg, setMsg] = useState('');

  const handleExport = () => {
    window.location.href = '/api/export/settings';
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await fetch('/api/export/settings/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) { setMsg('설정이 복원되었습니다.'); setTimeout(() => window.location.reload(), 1000); }
      else setMsg('복원 실패: ' + data.error);
    } catch (err) {
      setMsg('오류: ' + err.message);
    }
    e.target.value = '';
  };

  return (
    <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">설정 백업 / 복원</h2>
      <p className="text-xs text-slate-500">카테고리, 결제수단, 앱 설정값만 별도로 백업·복원합니다. 거래내역은 포함되지 않습니다.</p>
      <div className="flex flex-wrap gap-3 items-center">
        <button onClick={handleExport} className="text-slate-600 hover:text-slate-800 border border-slate-300 text-sm px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">설정 내보내기 (JSON)</button>
        <label className="cursor-pointer bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-sm px-4 py-2 rounded-lg transition-colors">
          설정 가져오기
          <input type="file" accept=".json" className="hidden" onChange={handleImport} />
        </label>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

function TransactionsBackupSection() {
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  
  const handleExport = () => {
    window.location.href = '/api/data/export';
  };
  
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      
      if (!payload.transactions || !Array.isArray(payload.transactions)) {
        setMessage('오류: 파일이 유효하지 않습니다. transactions 배열이 필요합니다.');
        return;
      }
      
      // Show preview of first 5 items, keep full array for import
      const previewData = payload.transactions.slice(0, 5);
      setPreview({
        data: previewData,
        all: payload.transactions,
        total: payload.transactions.length
      });
    } catch (err) {
      setMessage('오류: ' + err.message);
    }
    
    e.target.value = '';
  };
  
  const handleImportAction = async (mode) => {
    if (!preview) return;
    
    // For overwrite, confirm with user
    if (mode === 'overwrite' && !window.confirm('기존 거래내역이 모두 삭제됩니다. 계속하시겠습니까?')) {
      return;
    }
    
    try {
      const res = await fetch('/api/data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, transactions: preview.all }),
      });
      const data = await res.json();
      
      if (data.ok) {
        setMessage(`${data.imported}건 저장됨 (${data.skipped}건 스킵)`);
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        setMessage('오류: ' + data.error);
      }
    } catch (err) {
      setMessage('오류: ' + err.message);
    }
    
    // Reset preview
    setPreview(null);
  };
  
  return (
    <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">거래내역 백업 / 복원</h2>
      <p className="text-xs text-slate-500">거래내역을 이 앱 전용 JSON 형식으로 내보내거나, 내보낸 파일을 다시 불러와 추가하거나 전체 복원할 수 있습니다.</p>
      <div className="flex flex-wrap gap-3 items-center">
        <button onClick={handleExport} className="text-slate-600 hover:text-slate-800 border border-slate-300 text-sm px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">거래내역 내보내기 (JSON)</button>
        <label className="cursor-pointer bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-sm px-4 py-2 rounded-lg transition-colors">
          거래내역 불러오기
          <input type="file" accept=".json" className="hidden" onChange={handleImport} />
        </label>
        {message && <span className="text-xs text-slate-500">{message}</span>}
      </div>
      
      {preview && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">미리보기</h3>
          <div className="mb-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-2 py-1 text-left">날짜</th>
                  <th className="border border-slate-200 px-2 py-1 text-left">가맹점</th>
                  <th className="border border-slate-200 px-2 py-1 text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {preview.data.map((tx, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="border border-slate-200 px-2 py-1">{tx.date}</td>
                    <td className="border border-slate-200 px-2 py-1">{tx.merchant || '-'}</td>
                    <td className="border border-slate-200 px-2 py-1 text-right">{tx.amount ? tx.amount.toLocaleString('ko-KR') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mb-3">총 {preview.total}건</p>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => handleImportAction('append')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              새 데이터 추가
            </button>
            <button 
              onClick={() => handleImportAction('overwrite')} 
              className="bg-rose-600 hover:bg-rose-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              덮어쓰기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CardImportSection() {
  const [status, setStatus] = useState(null);
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setStatus(null);
    setMessage('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/card-import?preview=true', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '알 수 없는 오류');
      setStatus(data);
    } catch (err) {
      setMessage('오류: ' + err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/card-import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '알 수 없는 오류');
      let msg = `${data.imported}건 임포트 완료 (${data.skipped}건 스킵)`;
      if (data.errors?.length) msg += ` / 오류 ${data.errors.length}건`;
      setMessage(msg);
      setStatus(null);
      setFile(null);
    } catch (err) {
      setMessage('오류: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700">카드사 엑셀 임포트</h2>
      <p className="text-xs text-slate-500">카드사 홈페이지에서 내려받은 이용내역 파일을 업로드하면 거래내역으로 자동 등록됩니다. (농협·롯데·삼성·하나·현대)</p>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="cursor-pointer bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-sm px-4 py-2 rounded-lg transition-colors">
          파일 선택 (xlsx / xls)
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} disabled={loading} />
        </label>
        {loading && <span className="text-xs text-slate-400">처리 중…</span>}
        {message && <span className="text-xs text-slate-500">{message}</span>}
      </div>
      {status && (
        <div className="mt-2 space-y-3">
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <div className="font-medium text-slate-700 mb-1">{status.cardCompanyLabel}</div>
            <div>신규 <strong>{status.count.toLocaleString('ko-KR')}</strong>건 · 중복 스킵 {status.skipped.toLocaleString('ko-KR')}건</div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleImport} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {status.count}건 임포트
            </button>
            <button onClick={() => { setStatus(null); setFile(null); }} className="text-slate-500 hover:text-slate-700 text-sm px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const DANGER_CONFIRM_TEXT = '전체삭제';

function DangerZoneSection() {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');

  const handleDeleteAll = async () => {
    if (confirmText !== DANGER_CONFIRM_TEXT) return;
    if (!window.confirm('정말로 모든 거래내역을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

    setDeleting(true);
    setMessage('');
    try {
      const res = await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(`${data.deleted}건이 삭제되었습니다.`);
        setConfirmText('');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setMessage('오류: ' + data.error);
      }
    } catch (err) {
      setMessage('오류: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-rose-50 shadow-sm rounded-xl border border-rose-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-rose-700">위험 구역</h2>
      <p className="text-xs text-rose-600">
        전체 거래내역을 삭제합니다. 이 작업은 되돌릴 수 없으며, 삭제 전 위의 "거래내역 백업"으로 미리 내보내는 것을 권장합니다.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          className="bg-white border border-rose-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-rose-500"
          placeholder={`확인을 위해 "${DANGER_CONFIRM_TEXT}" 입력`}
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
        />
        <button
          onClick={handleDeleteAll}
          disabled={confirmText !== DANGER_CONFIRM_TEXT || deleting}
          className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {deleting ? '삭제 중...' : '전체 거래내역 삭제'}
        </button>
        {message && <span className="text-xs text-rose-700">{message}</span>}
      </div>
    </div>
  );
}
