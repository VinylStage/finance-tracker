import React, { useState } from 'react';
import { api } from '../lib/api';
import { useLoader } from '../hooks/useLoader';
import { useConfirm } from '../components/ConfirmProvider';
import LoadError from '../components/LoadError';
import CategoryBadge from '../components/CategoryBadge';
import { categoryStyle } from '../lib/categoryStyle';
import { TrustPanel, LastExportNote } from '../components/TrustPanel';
import { recordExport } from '../lib/backupStatus';
import { resetOnboarding } from '../lib/onboarding';
import { readTheme, saveTheme, toggleTheme, applyTheme } from '../lib/theme';
import Icon from '../components/Icon';

const CATEGORY_TYPES = ['수입', '고정지출', '변동필수', '부채상환', '선택지출', '저축'];
const PAYMENT_TYPES = ['신용', '체크', '이체', '현금성', '간편결제'];

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export default function Settings() {
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [appSettings, setAppSettings] = useState({ initial_balance: 0, monthly_income: 0 });
  const [recurringRules, setRecurringRules] = useState([]);

  const { loading, error, reload } = useLoader(async () => {
    const [cats, pms, settings, rules] = await Promise.all([
      api.get('/api/categories'),
      api.get('/api/payment-methods'),
      api.get('/api/settings'),
      api.get('/api/recurring-rules?include_inactive=1'),
    ]);
    setCategories(cats);
    setPaymentMethods(pms);
    setAppSettings(settings);
    setRecurringRules(rules);
  }, []);

  if (loading) return <div className="text-caption text-center py-20">로딩 중...</div>;
  if (error) return <LoadError error={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">설정</h1>
      <TrustPanel />
      <AppSettingsSection initial={appSettings} onSaved={reload} />
      <CategorySection categories={categories} onChanged={reload} />
      <PaymentMethodSection paymentMethods={paymentMethods} onChanged={reload} />
      <RecurringRuleSection rules={recurringRules} categories={categories} paymentMethods={paymentMethods} onChanged={reload} />
      <ExportSection />
      <SettingsBackupSection />
      <TransactionsBackupSection />
      <CardImportSection />
      <CsvImportSection />
      <DangerZoneSection />
    </div>
  );
}

const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

function AppSettingsSection({ initial, onSaved }) {
  const [form, setForm] = useState({
    initial_balance: String(initial.initial_balance || 0),
    monthly_income: String(initial.monthly_income || 0),
  });
  const [saved, setSaved] = useState(false);
  const [welcomeReset, setWelcomeReset] = useState(false);
  const [theme, setTheme] = useState(() => readTheme());
  const { alert } = useConfirm();

  // 저장·적용을 한 번에 한다. 미리보기 없이 즉시 반영하는 편이,
  // 껐다 켰다 하며 비교하려는 사용자에게 반응이 빠르다.
  const handleThemeToggle = () => {
    const next = toggleTheme(theme);
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/settings', {
        initial_balance: Number(form.initial_balance),
        monthly_income: Number(form.monthly_income),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } catch (err) {
      await alert(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">기본 설정</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="settings-initial-balance" className="block text-xs text-caption mb-1">초기 잔액 (원)</label>
          <input id="settings-initial-balance" type="number" className={inp} value={form.initial_balance} onChange={e => setForm(f => ({ ...f, initial_balance: e.target.value }))} />
        </div>
        <div>
          <label htmlFor="settings-monthly-income" className="block text-xs text-caption mb-1">월 수입 기준값 (원)</label>
          <input id="settings-monthly-income" type="number" className={inp} value={form.monthly_income} onChange={e => setForm(f => ({ ...f, monthly_income: e.target.value }))} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary text-sm px-5 py-2 rounded-control transition-colors">저장</button>
        {saved && <span className="text-xs text-goal-text">저장됨</span>}
      </div>
      <div className="flex items-center gap-3 border-t border-line-faint pt-4">
        <button
          type="button"
          onClick={handleThemeToggle}
          aria-pressed={theme === 'dark'}
          className="text-body hover:text-ink border border-line-strong text-sm px-4 py-2 rounded-control hover:bg-surface-page transition-colors"
        >
          {theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
        </button>
        <span className="text-xs text-caption">
          {theme === 'dark' ? '어두운 화면을 쓰고 있어요.' : '기본은 라이트 모드예요. 밤에 눈이 부시면 바꿔 보세요.'}
        </span>
      </div>
      <div className="flex items-center gap-3 border-t border-line-faint pt-4">
        <button
          type="button"
          onClick={() => { resetOnboarding(); setWelcomeReset(true); }}
          className="text-body hover:text-ink border border-line-strong text-sm px-4 py-2 rounded-control hover:bg-surface-page transition-colors"
        >
          시작 안내 다시 보기
        </button>
        <span className="text-xs text-caption">
          {welcomeReset ? '새로고침하면 시작 안내가 다시 보여요.' : '처음 실행 때 나오는 3단계 안내를 다시 볼 수 있어요.'}
        </span>
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
  const { confirm, alert } = useConfirm();

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/categories', { ...form, monthly_budget: Number(form.monthly_budget) || 0 });
      setForm({ major_type: '선택지출', name: '', monthly_budget: '' });
      setShowForm(false);
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleBudgetChange = async (cat, value) => {
    try {
      await api.put(`/api/categories/${cat.id}`, { ...cat, monthly_budget: Number(value) || 0 });
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleDeactivate = async (id) => {
    if (!await confirm('비활성화하시겠습니까?')) return;
    try {
      await api.del(`/api/categories/${id}`);
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
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
    try {
      await api.put(`/api/categories/${cat.id}`, { ...cat, ...editForm });
      setEditing(null);
      setEditForm({});
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleReActivate = async (id) => {
    if (!await confirm('재활성화하시겠습니까?')) return;
    try {
      await api.put(`/api/categories/${id}`, { is_active: 1 });
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
  };

  const filteredCategories = showInactive 
    ? categories 
    : categories.filter(c => c.is_active);

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-body">카테고리 관리</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowForm(s => !s)} 
            className="text-xs text-brand-text hover:text-brand-text"
          >
            + 추가
          </button>
          <button 
            onClick={() => setShowInactive(s => !s)} 
            className="text-xs text-caption hover:text-body"
          >
            {showInactive ? '활성 항목만 보기' : '비활성 항목 보기'}
          </button>
        </div>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end bg-surface-page rounded-control p-3">
          <div>
            <label htmlFor="category-major-type" className="block text-xs text-caption mb-1">유형</label>
            <select id="category-major-type" className={inp} value={form.major_type} onChange={e => setForm(f => ({ ...f, major_type: e.target.value }))}>
              {CATEGORY_TYPES.map(t => <option key={t} value={t}>{categoryStyle(t).icon} {t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="category-name" className="block text-xs text-caption mb-1">이름</label>
            <input id="category-name" type="text" className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label htmlFor="category-monthly-budget" className="block text-xs text-caption mb-1">월 예산</label>
            <input id="category-monthly-budget" type="number" className={inp} placeholder="0" value={form.monthly_budget} onChange={e => setForm(f => ({ ...f, monthly_budget: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary text-sm px-4 py-2 rounded-control transition-colors">추가</button>
        </form>
      )}
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-page sticky top-0">
            <tr className="border-b border-line">
              <th className="text-left px-3 py-2 text-caption font-medium">유형</th>
              <th className="text-left px-3 py-2 text-caption font-medium">이름</th>
              <th className="text-right px-3 py-2 text-caption font-medium">월 예산</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filteredCategories.map(c => (
              <tr key={c.id} className={`border-b border-line-faint ${!c.is_active ? 'opacity-50' : ''}`}>
                {editing === c.id ? (
                  <>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`${c.name} 유형 수정`}
                        className="w-full bg-surface border border-line-strong rounded px-2 py-1 text-xs"
                        value={editForm.major_type}
                        onChange={e => setEditForm(f => ({ ...f, major_type: e.target.value }))}
                      >
                        {CATEGORY_TYPES.map(t => <option key={t} value={t}>{categoryStyle(t).icon} {t}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        aria-label={`${c.name} 이름 수정`}
                        className="w-full bg-surface border border-line-strong rounded px-2 py-1 text-xs"
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        aria-label={`${c.name} 월 예산 수정`}
                        className="w-24 bg-surface border border-line-strong rounded px-2 py-1 text-right text-xs"
                        value={editForm.monthly_budget}
                        onChange={e => setEditForm(f => ({ ...f, monthly_budget: e.target.value }))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleEditSave(c)} className="text-xs text-brand-text hover:text-brand-text mr-2">저장</button>
                      <button onClick={handleEditCancel} className="text-xs text-caption hover:text-body">취소</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-xs">
                      <CategoryBadge majorType={c.major_type} name={c.major_type} />
                    </td>
                    <td className="px-3 py-2 text-ink">{c.name}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" defaultValue={c.monthly_budget}
                        aria-label={`${c.name} 월 예산`}
                        onBlur={e => handleBudgetChange(c, e.target.value)}
                        className="w-24 bg-surface border border-line-strong rounded px-2 py-1 text-right text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleEditStart(c)} className="text-brand-text hover:text-brand-text text-xs mr-2">수정</button>
                      {c.is_active ? (
                        <button onClick={() => handleDeactivate(c.id)} className="text-caption hover:text-loss-text text-xs">비활성화</button>
                      ) : (
                        <button onClick={() => handleReActivate(c.id)} className="text-caption hover:text-brand-text text-xs">재활성화</button>
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

const EMPTY_RULE_FORM = { category_id: '', merchant: '', amount: '', day_of_month: '1', payment_method_id: '', payment_style: '일시불', memo: '' };

function RecurringRuleSection({ rules, categories, paymentMethods, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_RULE_FORM);
  const [showInactive, setShowInactive] = useState(false);
  const { confirm, alert } = useConfirm();

  const startAdd = () => { setEditingId(null); setForm(EMPTY_RULE_FORM); setShowForm(true); };
  const startEdit = (r) => {
    setEditingId(r.id);
    setForm({
      category_id: String(r.category_id), merchant: r.merchant, amount: String(r.amount),
      day_of_month: String(r.day_of_month), payment_method_id: r.payment_method_id ? String(r.payment_method_id) : '',
      payment_style: r.payment_style, memo: r.memo || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = {
      ...form,
      category_id: Number(form.category_id),
      amount: Number(form.amount),
      day_of_month: Number(form.day_of_month),
      payment_method_id: form.payment_method_id ? Number(form.payment_method_id) : null,
    };
    try {
      if (editingId) await api.put(`/api/recurring-rules/${editingId}`, body);
      else await api.post('/api/recurring-rules', body);
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_RULE_FORM);
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleDeactivate = async (id) => {
    if (!await confirm('이 반복 규칙을 비활성화하시겠습니까? 이번 달 확인 목록에서 더 이상 나타나지 않습니다.')) return;
    try {
      await api.del(`/api/recurring-rules/${id}`);
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleReActivate = async (r) => {
    try {
      await api.put(`/api/recurring-rules/${r.id}`, {
        category_id: r.category_id, merchant: r.merchant, amount: r.amount, day_of_month: r.day_of_month,
        payment_method_id: r.payment_method_id, payment_style: r.payment_style, memo: r.memo, is_active: 1,
      });
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
  };

  const filteredRules = showInactive ? rules : rules.filter(r => r.is_active);

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-body">반복 거래 관리</h2>
        <div className="flex gap-2">
          <button onClick={showForm ? () => setShowForm(false) : startAdd} className="text-xs text-brand-text hover:text-brand-text">
            {showForm ? '취소' : '+ 추가'}
          </button>
          <button onClick={() => setShowInactive(s => !s)} className="text-xs text-caption hover:text-body">
            {showInactive ? '활성 항목만 보기' : '비활성 항목 보기'}
          </button>
        </div>
      </div>
      <p className="text-xs text-caption">
        매달 금액이 완전히 고정된 지출(구독료 등)만 등록하세요. 통신비처럼 매달 금액이 달라지는 항목은 계속 직접 입력해야 합니다.
        등록해도 자동으로 거래가 생기지 않고, 대시보드의 "이번 달 반복 거래 확인"에서 매달 확인 후 생성합니다.
      </p>
      {showForm && (
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end bg-surface-page rounded-control p-3">
          <div>
            <label htmlFor="rule-category" className="block text-xs text-caption mb-1">카테고리</label>
            <select id="rule-category" className={inp} value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} required>
              <option value="">선택...</option>
              {categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rule-merchant" className="block text-xs text-caption mb-1">가맹점/이름</label>
            <input id="rule-merchant" type="text" className={inp} value={form.merchant} onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} required />
          </div>
          <div>
            <label htmlFor="rule-amount" className="block text-xs text-caption mb-1">금액</label>
            <input id="rule-amount" type="number" className={inp} placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
          </div>
          <div>
            <label htmlFor="rule-day-of-month" className="block text-xs text-caption mb-1">매월 며칠</label>
            <input id="rule-day-of-month" type="number" min="1" max="31" className={`${inp} w-20`} value={form.day_of_month} onChange={e => setForm(f => ({ ...f, day_of_month: e.target.value }))} required />
          </div>
          <div>
            <label htmlFor="rule-payment-method" className="block text-xs text-caption mb-1">결제수단</label>
            <select id="rule-payment-method" className={inp} value={form.payment_method_id} onChange={e => setForm(f => ({ ...f, payment_method_id: e.target.value }))}>
              <option value="">선택...</option>
              {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rule-payment-style" className="block text-xs text-caption mb-1">결제방식</label>
            <select id="rule-payment-style" className={inp} value={form.payment_style} onChange={e => setForm(f => ({ ...f, payment_style: e.target.value }))}>
              <option value="일시불">일시불</option>
              <option value="해당없음">해당없음</option>
            </select>
          </div>
          <button type="submit" className="btn-primary text-sm px-4 py-2 rounded-control transition-colors">
            {editingId ? '저장' : '추가'}
          </button>
        </form>
      )}
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-page sticky top-0">
            <tr className="border-b border-line">
              <th className="text-left px-3 py-2 text-caption font-medium">가맹점</th>
              <th className="text-left px-3 py-2 text-caption font-medium">카테고리</th>
              <th className="text-right px-3 py-2 text-caption font-medium">금액</th>
              <th className="text-right px-3 py-2 text-caption font-medium">매월</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-caption text-xs py-6">등록된 반복 규칙이 없습니다.</td></tr>
            ) : filteredRules.map(r => (
              <tr key={r.id} className={`border-b border-line-faint ${!r.is_active ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 text-ink">{r.merchant}</td>
                <td className="px-3 py-2 text-caption text-xs">{r.category_name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.amount)}</td>
                <td className="px-3 py-2 text-right text-xs text-caption">{r.day_of_month}일</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => startEdit(r)} className="text-brand-text hover:text-brand-text text-xs mr-2">수정</button>
                  {r.is_active ? (
                    <button onClick={() => handleDeactivate(r.id)} className="text-caption hover:text-loss-text text-xs">비활성화</button>
                  ) : (
                    <button onClick={() => handleReActivate(r)} className="text-caption hover:text-brand-text text-xs">재활성화</button>
                  )}
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
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const { confirm, alert } = useConfirm();

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/payment-methods', form);
      setForm({ name: '', type: '신용' });
      setShowForm(false);
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleDeactivate = async (id) => {
    if (!await confirm('비활성화하시겠습니까?')) return;
    try {
      await api.del(`/api/payment-methods/${id}`);
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
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
    try {
      await api.put(`/api/payment-methods/${pm.id}`, { ...pm, ...editForm });
      setEditing(null);
      setEditForm({});
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleReActivate = async (id) => {
    if (!await confirm('재활성화하시겠습니까?')) return;
    try {
      await api.put(`/api/payment-methods/${id}`, { is_active: 1 });
      onChanged();
    } catch (err) {
      await alert(err.message);
    }
  };

  const filteredPaymentMethods = showInactive 
    ? paymentMethods 
    : paymentMethods.filter(p => p.is_active);

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-body">결제수단 관리</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowForm(s => !s)} 
            className="text-xs text-brand-text hover:text-brand-text"
          >
            + 추가
          </button>
          <button 
            onClick={() => setShowInactive(s => !s)} 
            className="text-xs text-caption hover:text-body"
          >
            {showInactive ? '활성 항목만 보기' : '비활성 항목 보기'}
          </button>
        </div>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end bg-surface-page rounded-control p-3">
          <div>
            <label htmlFor="pm-name" className="block text-xs text-caption mb-1">이름</label>
            <input id="pm-name" type="text" className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label htmlFor="pm-type" className="block text-xs text-caption mb-1">유형</label>
            <select id="pm-type" className={inp} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-primary text-sm px-4 py-2 rounded-control transition-colors">추가</button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {filteredPaymentMethods.map(p => (
          <span key={p.id} className={`flex items-center gap-2 bg-surface-page border border-line rounded-full pl-3 pr-1 py-1 text-xs ${!p.is_active ? 'opacity-50' : ''}`}>
            {editing === p.id ? (
              <>
                <input
                  type="text"
                  aria-label={`${p.name} 이름 수정`}
                  className="bg-surface border border-line-strong rounded px-2 py-1 text-xs w-16"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
                <select
                  aria-label={`${p.name} 유형 수정`}
                  className="bg-surface border border-line-strong rounded px-2 py-1 text-xs"
                  value={editForm.type}
                  onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                >
                  {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => handleEditSave(p)} className="text-xs text-brand-text hover:text-brand-text mr-1">저장</button>
                <button onClick={handleEditCancel} className="text-xs text-caption hover:text-body">취소</button>
              </>
            ) : (
              <>
                {p.name} <span className="text-caption">({p.type})</span>
                <div className="flex gap-1">
                  <button onClick={() => handleEditStart(p)} className="text-xs text-brand-text hover:text-brand-text px-1.5 py-0.5 rounded-full hover:bg-brand-tint" aria-label="편집">
                    <Icon name="edit" size={14} />
                  </button>
                  {p.is_active ? (
                    <button onClick={() => handleDeactivate(p.id)} className="text-caption hover:text-loss-text px-1.5 py-0.5 rounded-full hover:bg-loss-tint" aria-label="비활성화">
                      <Icon name="close" size={14} />
                    </button>
                  ) : (
                    <button onClick={() => handleReActivate(p.id)} className="text-caption hover:text-brand-text px-1.5 py-0.5 rounded-full hover:bg-brand-tint" aria-label="재활성화">
                      <Icon name="refresh" size={14} />
                    </button>
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
  const [exportedAt, setExportedAt] = useState(0);

  const handleExport = (format) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString();
    recordExport('transactions', new Date().toISOString());
    setExportedAt(Date.now());
    window.location.href = `/api/export/${format}${query ? `?${query}` : ''}`;
  };

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">데이터 내보내기</h2>
      <LastExportNote kind="transactions" now={exportedAt || Date.now()} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="export-from" className="block text-xs text-caption mb-1">시작일 (CSV, 선택)</label>
          <input id="export-from" type="date" className={inp} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="export-to" className="block text-xs text-caption mb-1">종료일 (CSV, 선택)</label>
          <input id="export-to" type="date" className={inp} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button onClick={() => handleExport('csv')} className="btn-primary text-sm px-4 py-2 rounded-control transition-colors">CSV 다운로드 (거래내역)</button>
        <button onClick={() => handleExport('json')} className="text-body hover:text-ink border border-line-strong text-sm px-4 py-2 rounded-control hover:bg-surface-page transition-colors">JSON 다운로드 (전체 백업)</button>
      </div>
    </div>
  );
}

function SettingsBackupSection() {
  const [msg, setMsg] = useState('');
  const [exportedAt, setExportedAt] = useState(0);
  const { confirm, alert } = useConfirm();

  const handleExport = () => {
    recordExport('settings', new Date().toISOString());
    setExportedAt(Date.now());
    window.location.href = '/api/export/settings';
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (!await confirm('현재 카테고리·결제수단·설정값을 파일 내용으로 덮어씁니다. 계속할까요?', { tone: 'danger', confirmLabel: '복원' })) {
        e.target.value = '';
        return;
      }
      const text = await file.text();
      const payload = JSON.parse(text);
      const data = await api.post('/api/export/settings/restore', { ...payload, confirm: 'OVERWRITE_SETTINGS' });
      if (data.ok) { setMsg('설정이 복원되었습니다.'); setTimeout(() => window.location.reload(), 1000); }
      else setMsg('복원 실패: ' + data.error);
    } catch (err) {
      await alert(err.message);
    }
    e.target.value = '';
  };

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">설정 백업 / 복원</h2>
      <p className="text-xs text-caption">카테고리, 결제수단, 앱 설정값만 별도로 백업·복원합니다. 거래내역은 포함되지 않습니다.</p>
      <LastExportNote kind="settings" now={exportedAt || Date.now()} />
      <div className="flex flex-wrap gap-3 items-center">
        <button onClick={handleExport} className="text-body hover:text-ink border border-line-strong text-sm px-4 py-2 rounded-control hover:bg-surface-page transition-colors">설정 내보내기 (JSON)</button>
        <label className="cursor-pointer bg-brand-tint hover:bg-brand-tint border border-brand-tint text-brand-text text-sm px-4 py-2 rounded-control transition-colors">
          설정 가져오기
          <input type="file" accept=".json" className="hidden" onChange={handleImport} />
        </label>
        {msg && <span className="text-xs text-caption">{msg}</span>}
      </div>
    </div>
  );
}

function TransactionsBackupSection() {
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [exportedAt, setExportedAt] = useState(0);
  const { confirm } = useConfirm();

  const handleExport = () => {
    recordExport('data', new Date().toISOString());
    setExportedAt(Date.now());
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
    if (mode === 'overwrite' && !await confirm('기존 거래내역이 모두 삭제됩니다. 계속하시겠습니까?', { tone: 'danger' })) {
      return;
    }

    try {
      const body = { mode, transactions: preview.all };
      // overwrite는 서버가 명시적 확인 토큰을 요구한다(파괴적 동작 방어)
      if (mode === 'overwrite') body.confirm = 'DELETE_ALL';
      const data = await api.post('/api/data/import', body);

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
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">거래내역 백업 / 복원</h2>
      <p className="text-xs text-caption">거래내역을 이 앱 전용 JSON 형식으로 내보내거나, 내보낸 파일을 다시 불러와 추가하거나 전체 복원할 수 있습니다.</p>
      <LastExportNote kind="data" now={exportedAt || Date.now()} />
      <div className="flex flex-wrap gap-3 items-center">
        <button onClick={handleExport} className="text-body hover:text-ink border border-line-strong text-sm px-4 py-2 rounded-control hover:bg-surface-page transition-colors">거래내역 내보내기 (JSON)</button>
        <label className="cursor-pointer bg-brand-tint hover:bg-brand-tint border border-brand-tint text-brand-text text-sm px-4 py-2 rounded-control transition-colors">
          거래내역 불러오기
          <input type="file" accept=".json" className="hidden" onChange={handleImport} />
        </label>
        {message && <span className="text-xs text-caption">{message}</span>}
      </div>
      
      {preview && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-body mb-2">미리보기</h3>
          <div className="mb-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-surface-page">
                  <th className="border border-line px-2 py-1 text-left">날짜</th>
                  <th className="border border-line px-2 py-1 text-left">가맹점</th>
                  <th className="border border-line px-2 py-1 text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {preview.data.map((tx, i) => (
                  <tr key={i} className="border-b border-line-faint">
                    <td className="border border-line px-2 py-1">{tx.date}</td>
                    <td className="border border-line px-2 py-1">{tx.merchant || '-'}</td>
                    <td className="border border-line px-2 py-1 text-right">{tx.amount ? tx.amount.toLocaleString('ko-KR') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-caption mb-3">총 {preview.total}건</p>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => handleImportAction('append')}
              className="btn-primary text-sm px-4 py-2 rounded-control transition-colors"
            >
              새 데이터 추가
            </button>
            <button 
              onClick={() => handleImportAction('overwrite')} 
              className="btn-danger text-sm px-4 py-2 rounded-control transition-colors"
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
  const [preview, setPreview] = useState(null); // { results, totals }
  const [files, setFiles] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // 여러 파일을 미리보기 요청. 파일별 결과(성공/실패)를 함께 받는다.
  const handleFiles = async (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setFiles(selected);
    setPreview(null);
    setMessage('');
    setLoading(true);
    try {
      const fd = new FormData();
      selected.forEach((f) => fd.append('files', f));
      const data = await api.raw('/api/card-import?preview=true', { method: 'POST', body: fd });
      setPreview(data);
    } catch (err) {
      setMessage('오류: ' + err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleImport = async () => {
    if (!files.length) return;
    setLoading(true);
    setMessage('');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const data = await api.raw('/api/card-import', { method: 'POST', body: fd });
      const t = data.totals || {};
      let msg = `${(t.imported || 0).toLocaleString('ko-KR')}건 임포트 완료 (중복 스킵 ${(t.skipped || 0).toLocaleString('ko-KR')}건`;
      if (t.failed) msg += `, 실패 파일 ${t.failed}개`;
      msg += ')';
      setMessage(msg);
      setPreview(null);
      setFiles([]);
    } catch (err) {
      setMessage('오류: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const previewTotal = preview?.totals?.count || 0;

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">카드사 엑셀 임포트</h2>
      <p className="text-xs text-caption">카드사 홈페이지에서 내려받은 이용내역 파일을 업로드하면 거래내역으로 자동 등록됩니다. 여러 파일을 한 번에 선택할 수 있습니다. (농협·롯데·삼성·하나·현대)</p>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="cursor-pointer bg-brand-tint hover:bg-brand-tint border border-brand-tint text-brand-text text-sm px-4 py-2 rounded-control transition-colors">
          파일 선택 (여러 개 가능)
          <input type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleFiles} disabled={loading} />
        </label>
        {loading && <span className="text-xs text-caption">처리 중…</span>}
        {message && <span className="text-xs text-caption">{message}</span>}
      </div>
      {preview && (
        <div className="mt-2 space-y-3">
          <div className="text-xs bg-surface-page border border-line rounded-control px-4 py-3 space-y-1.5">
            <div className="font-medium text-body">
              파일 {preview.totals.files}개 · 성공 {preview.totals.succeeded} / 실패 {preview.totals.failed}
            </div>
            {preview.results.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={r.ok ? 'text-goal-text' : 'text-loss-text'}>
                  {r.ok ? <Icon name="check_circle" filled size={14} /> : <Icon name="close" size={14} />}
                </span>
                <span className="text-body break-all">
                  <span className="font-medium">{r.filename}</span>
                  {r.ok
                    ? ` — ${r.cardCompanyLabel} · 신규 ${(r.count || 0).toLocaleString('ko-KR')}건 · 중복 ${(r.skipped || 0).toLocaleString('ko-KR')}건`
                    : ` — ${r.error}`}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleImport} disabled={loading || previewTotal === 0} className="btn-primary text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50">
              신규 {previewTotal.toLocaleString('ko-KR')}건 임포트
            </button>
            <button onClick={() => { setPreview(null); setFiles([]); }} className="text-caption hover:text-body text-sm px-4 py-2 rounded-control border border-line hover:bg-surface-page transition-colors">
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

function CsvImportSection() {
  const [csvText, setCsvText] = useState(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null); // { count, skipped, invalid }
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(null);
    setMessage('');
    setLoading(true);
    try {
      const text = await readFileAsText(file);
      setCsvText(text);
      setFileName(file.name);
      const data = await api.post('/api/csv-import?preview=true', { cardCompany: 'shinhan', csvText: text });
      setPreview(data);
    } catch (err) {
      setMessage('오류: ' + err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleImport = async () => {
    if (!csvText) return;
    setLoading(true);
    setMessage('');
    try {
      const data = await api.post('/api/csv-import', { cardCompany: 'shinhan', csvText });
      let msg = `${(data.imported || 0).toLocaleString('ko-KR')}건 임포트 완료 (중복 스킵 ${(data.skipped || 0).toLocaleString('ko-KR')}건`;
      if (data.invalid) msg += `, 형식 오류 ${data.invalid}건 제외`;
      msg += ')';
      setMessage(msg);
      setPreview(null);
      setCsvText(null);
      setFileName('');
    } catch (err) {
      setMessage('오류: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">신한카드 CSV 임포트</h2>
      <p className="text-xs text-caption">
        신한카드는 엑셀 내보내기를 지원하지 않아 CSV 파일로 업로드합니다. 실제 내보내기 파일로 컬럼 구성이 검증되지 않았으니, 미리보기에서 건수를 확인한 뒤 임포트하세요.
      </p>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="cursor-pointer bg-brand-tint hover:bg-brand-tint border border-brand-tint text-brand-text text-sm px-4 py-2 rounded-control transition-colors">
          파일 선택
          <input type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={loading} />
        </label>
        {loading && <span className="text-xs text-caption">처리 중…</span>}
        {message && <span className="text-xs text-caption">{message}</span>}
      </div>
      {preview && (
        <div className="mt-2 space-y-3">
          <div className="text-xs bg-surface-page border border-line rounded-control px-4 py-3 space-y-1">
            <div className="font-medium text-body break-all">{fileName}</div>
            <div className="text-body">
              신규 {(preview.count || 0).toLocaleString('ko-KR')}건 · 중복 {(preview.skipped || 0).toLocaleString('ko-KR')}건
              {preview.invalid ? ` · 형식 오류(제외) ${preview.invalid}건` : ''}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleImport} disabled={loading || (preview.count || 0) === 0} className="btn-primary text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50">
              신규 {(preview.count || 0).toLocaleString('ko-KR')}건 임포트
            </button>
            <button onClick={() => { setPreview(null); setCsvText(null); setFileName(''); }} className="text-caption hover:text-body text-sm px-4 py-2 rounded-control border border-line hover:bg-surface-page transition-colors">
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
  const { confirm } = useConfirm();

  const handleDeleteAll = async () => {
    if (confirmText !== DANGER_CONFIRM_TEXT) return;
    if (!await confirm('정말로 모든 거래내역을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.', { tone: 'danger', confirmLabel: '전체 삭제' })) return;

    setDeleting(true);
    setMessage('');
    try {
      const data = await api.del('/api/transactions', { all: true });
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
    <div className="bg-loss-tint shadow-card rounded-card border border-loss-border p-5 space-y-4">
      <h2 className="text-sm font-semibold text-loss-strong">위험 구역</h2>
      <p className="text-xs text-loss-text">
        전체 거래내역을 삭제합니다. 이 작업은 되돌릴 수 없으며, 삭제 전 위의 "거래내역 백업"으로 미리 내보내는 것을 권장합니다.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          aria-label={`확인을 위해 "${DANGER_CONFIRM_TEXT}" 입력`}
          className="bg-surface border border-loss-border-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-loss-fill"
          placeholder={`확인을 위해 "${DANGER_CONFIRM_TEXT}" 입력`}
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
        />
        <button
          onClick={handleDeleteAll}
          disabled={confirmText !== DANGER_CONFIRM_TEXT || deleting}
          className="btn-danger disabled:cursor-not-allowed text-sm px-4 py-2 rounded-control transition-colors"
        >
          {deleting ? '삭제 중...' : '전체 거래내역 삭제'}
        </button>
        {message && <span className="text-xs text-loss-strong">{message}</span>}
      </div>
    </div>
  );
}
