import React, { useState } from 'react';
import { api } from '../lib/api';
import { localYMD } from '../lib/date';
import { useLoader } from '../hooks/useLoader';
import { useConfirm } from '../components/ConfirmProvider';
import LoadError from '../components/LoadError';
import DerivedTransactions from '../components/DerivedTransactions';
import { anchorId } from '../lib/derivedOrigin';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';

const DEBT_TYPES = ['일반', '마이너스통장', '학자금', '전세자금'];

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

function TypeBadge({ type }) {
  const isMinus = type === '마이너스통장';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
      isMinus ? 'bg-brand-tint text-brand-text' : 'bg-surface-sunken text-caption'
    }`}>
      {type || '일반'}
    </span>
  );
}

export default function Debts() {
  const [items, setItems] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalInterest, setTotalInterest] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [interestTarget, setInterestTarget] = useState(null);
  const [expandedLog, setExpandedLog] = useState(null);
  const [logs, setLogs] = useState({});
  const { confirm, alert } = useConfirm();

  const { loading, error, reload } = useLoader(async () => {
    const d = await api.get('/api/debts');
    setItems(d.data || []);
    setTotalBalance(d.total_balance || 0);
    setTotalInterest(d.total_monthly_interest || 0);
  }, []);

  const handleSave = async (formData) => {
    try {
      if (editItem) await api.put(`/api/debts/${editItem.id}`, formData);
      else await api.post('/api/debts', formData);
      setShowForm(false);
      setEditItem(null);
      reload();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!await confirm('삭제하시겠습니까? 이자 이력도 함께 삭제됩니다.', { tone: 'danger' })) return;
    try {
      await api.del(`/api/debts/${id}`);
      reload();
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setShowForm(true);
  };

  const loadInterestLog = async (debtId) => {
    const r = await api.get(`/api/debts/${debtId}/interest-log`);
    setLogs(prev => ({ ...prev, [debtId]: r.data || [] }));
  };

  const toggleLog = async (debt) => {
    if (expandedLog === debt.id) { setExpandedLog(null); return; }
    setExpandedLog(debt.id);
    if (!logs[debt.id]) {
      try {
        await loadInterestLog(debt.id);
      } catch (err) {
        await alert(err.message);
      }
    }
  };

  const handleAddInterest = async (formData) => {
    const debtId = interestTarget.id;
    try {
      await api.post(`/api/debts/${debtId}/interest`, formData);
      setInterestTarget(null);
      reload();
      if (expandedLog === debtId) await loadInterestLog(debtId);
    } catch (err) {
      await alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">부채 현황</h1>
        <button
          onClick={() => { setEditItem(null); setShowForm(true); }}
          className="btn-primary text-sm px-4 py-2 rounded-control transition-colors"
        >
          + 부채 추가
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface shadow-card rounded-card p-5 border border-line">
          <p className="text-caption text-sm mb-1">총 부채</p>
          <p className="text-2xl font-bold text-loss-text">{fmt(totalBalance)}</p>
        </div>
        <div className="bg-surface shadow-card rounded-card p-5 border border-line">
          <p className="text-caption text-sm mb-1">월이자 합계</p>
          <p className="text-2xl font-bold text-ink">{fmt(totalInterest)}</p>
        </div>
      </div>

      {showForm && (
        <DebtForm
          initial={editItem}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {interestTarget && (
        <InterestForm
          debt={interestTarget}
          onSave={handleAddInterest}
          onCancel={() => setInterestTarget(null)}
        />
      )}

      {loading ? (
        <div className="text-caption text-center py-10">로딩 중...</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Icon name="account_balance" size={32} />}
          title="아직 등록된 부채가 없어요"
          description="대출이나 카드 할부금을 등록하면 잔액과 월 이자를 한곳에서 볼 수 있어요. 없다면 그대로 두셔도 됩니다."
        />
      ) : (
        <div className="bg-surface shadow-card rounded-card border border-line overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-page">
              <tr className="border-b border-line">
                <th className="text-left px-4 py-3 text-caption font-medium">부채명</th>
                <th className="text-left px-4 py-3 text-caption font-medium">타입</th>
                <th className="text-right px-4 py-3 text-caption font-medium">잔액</th>
                <th className="text-right px-4 py-3 text-caption font-medium">연이율</th>
                <th className="text-right px-4 py-3 text-caption font-medium">월이자 (참고)</th>
                <th className="text-left px-4 py-3 text-caption font-medium hidden md:table-cell">메모</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d, i) => (
                <React.Fragment key={d.id}>
                  <tr
                    id={anchorId('debt', d.id)}
                    className={`border-b border-line-faint hover:bg-surface-page transition-colors scroll-mt-6 ${i % 2 === 0 ? '' : 'bg-surface-page/50'}`}
                  >
                    <td className="px-4 py-3 text-ink">{d.name}</td>
                    <td className="px-4 py-3"><TypeBadge type={d.type} /></td>
                    <td className="px-4 py-3 text-right text-loss-text font-medium tabular-nums">{fmt(d.balance)}</td>
                    <td className="px-4 py-3 text-right text-body tabular-nums">{d.annual_rate}%</td>
                    <td className="px-4 py-3 text-right text-caption tabular-nums">{fmt(d.monthly_interest)}</td>
                    <td className="px-4 py-3 text-caption text-xs hidden md:table-cell">{d.memo || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end flex-wrap">
                        {d.type === '마이너스통장' && (
                          <>
                            <button
                              onClick={() => setInterestTarget(d)}
                              className="text-caption hover:text-brand-text transition-colors text-xs"
                            >
                              이자 추가
                            </button>
                            <button
                              onClick={() => toggleLog(d)}
                              className="text-caption hover:text-brand-text transition-colors text-xs"
                            >
                              이력 {expandedLog === d.id ? '▲' : '▼'}
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleEdit(d)}
                          className="text-caption hover:text-brand-text transition-colors text-xs"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="text-caption hover:text-loss-text transition-colors text-xs"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedLog === d.id && (
                    <tr className="border-b border-line-faint bg-surface-page/70">
                      <td colSpan={7} className="px-4 py-3">
                        <InterestLog rows={logs[d.id]} />
                        {/* 이자 기록이 만든 거래를 같은 자리에서 보여준다(#270).
                            기록과 거래가 떨어져 있으면 사용자는 둘이 이어져
                            있다는 것을 알 수 없다. */}
                        <DerivedTransactions kind="debt" id={d.id} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InterestLog({ rows }) {
  if (!rows) return <div className="text-caption text-xs py-2">불러오는 중...</div>;
  if (!rows.length) return <div className="text-caption text-xs py-2">이자 이력이 없습니다.</div>;
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium text-caption mb-1">이자 이력</h4>
      {rows.map(r => (
        <div key={r.id} className="flex items-center justify-between text-xs text-body bg-surface rounded-control px-3 py-2 border border-line">
          <span className="text-caption">{r.log_date}</span>
          <span>금리 {r.rate_at_time}%</span>
          <span className="text-loss-text font-medium">+{fmt(r.interest_amount)}</span>
          <span className="text-caption tabular-nums">{fmt(r.balance_before)} → {fmt(r.balance_after)}</span>
          <span className="text-caption truncate max-w-[120px]">{r.memo || '—'}</span>
        </div>
      ))}
    </div>
  );
}

function DebtForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    balance: initial ? String(initial.balance) : '',
    annual_rate: initial ? String(initial.annual_rate) : '',
    type: initial?.type || '일반',
    memo: initial?.memo || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      balance: Number(form.balance),
      annual_rate: form.annual_rate ? Number(form.annual_rate) : 0,
    });
  };

  const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

  return (
    <form onSubmit={handleSubmit} className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">{initial ? '부채 수정' : '부채 추가'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="debt-name" className="block text-xs text-caption mb-1">부채명 *</label>
          <input id="debt-name" type="text" className={inp} value={form.name} onChange={e => set('name', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="debt-type" className="block text-xs text-caption mb-1">타입</label>
          <select id="debt-type" className={inp} value={form.type} onChange={e => set('type', e.target.value)}>
            {DEBT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="debt-balance" className="block text-xs text-caption mb-1">잔액 (원) *</label>
          <input id="debt-balance" type="number" className={inp} value={form.balance} onChange={e => set('balance', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="debt-annual-rate" className="block text-xs text-caption mb-1">연이율 (%)</label>
          <input id="debt-annual-rate" type="number" step="0.01" className={inp} placeholder="0" value={form.annual_rate} onChange={e => set('annual_rate', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="debt-memo" className="block text-xs text-caption mb-1">메모</label>
          <input id="debt-memo" type="text" className={inp} value={form.memo} onChange={e => set('memo', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="btn-primary text-sm px-5 py-2 rounded-control transition-colors">
          {initial ? '저장' : '추가'}
        </button>
        <button type="button" onClick={onCancel} className="text-caption hover:text-ink text-sm px-4 py-2 rounded-control hover:bg-surface-sunken transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}

function InterestForm({ debt, onSave, onCancel }) {
  const today = localYMD();
  const [form, setForm] = useState({
    log_date: today,
    rate: String(debt.annual_rate ?? 0),
    interest_amount: '',
    memo: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      rate: Number(form.rate),
      interest_amount: Number(form.interest_amount),
    });
  };

  const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

  return (
    <form onSubmit={handleSubmit} className="bg-surface shadow-card rounded-card border border-brand-tint p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">
        이자 추가 — <span className="text-brand-text">{debt.name}</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label htmlFor="interest-log-date" className="block text-xs text-caption mb-1">날짜 *</label>
          <input id="interest-log-date" type="date" className={inp} value={form.log_date} onChange={e => set('log_date', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="interest-rate" className="block text-xs text-caption mb-1">현재 금리 (%) *</label>
          <input id="interest-rate" type="number" step="0.01" className={inp} value={form.rate} onChange={e => set('rate', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="interest-amount" className="block text-xs text-caption mb-1">이자 금액 (원) *</label>
          <input id="interest-amount" type="number" className={inp} value={form.interest_amount} onChange={e => set('interest_amount', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="interest-memo" className="block text-xs text-caption mb-1">메모</label>
          <input id="interest-memo" type="text" className={inp} value={form.memo} onChange={e => set('memo', e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-caption">이자 금액은 부채 잔액에 자동으로 더해집니다.</p>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="btn-primary text-sm px-5 py-2 rounded-control transition-colors">
          추가
        </button>
        <button type="button" onClick={onCancel} className="text-caption hover:text-ink text-sm px-4 py-2 rounded-control hover:bg-surface-sunken transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}
