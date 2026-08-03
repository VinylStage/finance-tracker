import React, { useState } from 'react';
import { api } from '../lib/api';
import { localYMD } from '../lib/date';
import { useLoader } from '../hooks/useLoader';
import { useConfirm } from '../components/ConfirmProvider';
import LoadError from '../components/LoadError';
import DerivedTransactions from '../components/DerivedTransactions';
import { anchorId } from '../lib/derivedOrigin';
import DebtRateHistory from '../components/DebtRateHistory';
import DebtInterestProjection from '../components/DebtInterestProjection';
import { LOAN_TYPE_OPTIONS, loanTypeFields, loanTypeHint, creditUsageRatio } from '../lib/loanType';
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
  const [repayTarget, setRepayTarget] = useState(null);
  const [repayments, setRepayments] = useState({});
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

  const loadRepayments = async (debtId) => {
    const r = await api.get(`/api/debts/${debtId}/repayments`);
    setRepayments(prev => ({ ...prev, [debtId]: r.data || [] }));
  };

  // 부분상환은 잔액을 직접 고치지 않고 여기를 거친다(#287). 직접 고치면 언제
  // 얼마를 갚았는지가 남지 않아 과거 이자를 재계산할 수 없다.
  const handleRepay = async (formData) => {
    const debtId = repayTarget.id;
    try {
      await api.post(`/api/debts/${debtId}/repayments`, formData);
      setRepayTarget(null);
      reload();
      if (expandedLog === debtId) await loadRepayments(debtId);
    } catch (err) {
      await alert(err.message);
    }
  };

  const handleDeleteRepayment = async (debtId, repayment) => {
    const ok = await confirm(
      `${fmt(repayment.amount)} 상환 기록을 지울까요? 원금 ${fmt(repayment.principal_portion)}이 잔액으로 되돌아갑니다.`,
      { tone: 'danger', confirmLabel: '지우기' }
    );
    if (!ok) return;
    try {
      await api.del(`/api/debts/${debtId}/repayments/${repayment.id}`);
      reload();
      await loadRepayments(debtId);
    } catch (err) {
      await alert(err.message);
    }
  };

  const toggleLog = async (debt) => {
    if (expandedLog === debt.id) { setExpandedLog(null); return; }
    setExpandedLog(debt.id);
    try {
      if (!logs[debt.id]) await loadInterestLog(debt.id);
      if (!repayments[debt.id]) await loadRepayments(debt.id);
    } catch (err) {
      await alert(err.message);
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

      {repayTarget && (
        <RepaymentForm
          debt={repayTarget}
          onSave={handleRepay}
          onCancel={() => setRepayTarget(null)}
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
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="text-loss-text font-medium">{fmt(d.balance)}</span>
                      {d.credit_line && <CreditLineStatus creditLine={d.credit_line} />}
                    </td>
                    <td className="px-4 py-3 text-right text-body tabular-nums">{d.annual_rate}%</td>
                    <td className="px-4 py-3 text-right text-caption tabular-nums">{fmt(d.monthly_interest)}</td>
                    <td className="px-4 py-3 text-caption text-xs hidden md:table-cell">{d.memo || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end flex-wrap">
                        {/* 계산과 관련된 판정은 loan_type 을 본다(#329). 용도(type)를
                            '학자금' 으로 바꿨다고 마이너스통장 기능이 사라지면 안 된다. */}
                        {d.loan_type === 'credit_line' && (
                          <button
                            onClick={() => setInterestTarget(d)}
                            className="text-caption hover:text-brand-text transition-colors text-xs"
                          >
                            이자 추가
                          </button>
                        )}
                        <button
                          onClick={() => setRepayTarget(d)}
                          className="text-caption hover:text-brand-text transition-colors text-xs"
                        >
                          상환
                        </button>
                        <button
                          onClick={() => toggleLog(d)}
                          className="text-caption hover:text-brand-text transition-colors text-xs"
                        >
                          이력 {expandedLog === d.id ? '▲' : '▼'}
                        </button>
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
                        <RepaymentLog
                          rows={repayments[d.id]}
                          onDelete={(r) => handleDeleteRepayment(d.id, r)}
                        />
                        {/* 이자 기록이 만든 거래를 같은 자리에서 보여준다(#270).
                            기록과 거래가 떨어져 있으면 사용자는 둘이 이어져
                            있다는 것을 알 수 없다. */}
                        <DerivedTransactions kind="debt" id={d.id} />
                        <DebtRateHistory debtId={d.id} onChanged={reload} />
                        <DebtInterestProjection debt={d} />
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

// 부분상환 이력(#287). 이자 이력과 같은 모양으로 둔다 — 두 이력이 같은 잔액
// 타임라인을 이루므로 화면에서도 나란히 읽혀야 한다.
// 한도 사용 상태(#329).
//
// 초과를 색만으로 알리지 않는다 — 아이콘과 텍스트를 함께 쓴다(#191, WCAG 1.4.1).
// 초과해도 막지 않는다. 연체 이자로 한도를 넘는 상태가 실제로 있고, 그때 앱이
// 사실을 못 보여주면 기록할 방법이 없어진다(#285 결정).
function CreditLineStatus({ creditLine }) {
  const ratio = creditUsageRatio(creditLine);
  return (
    <span className="block mt-0.5">
      <span className="block h-1 w-full max-w-[7rem] ml-auto rounded-bar bg-surface-sunken overflow-hidden">
        <span
          aria-hidden="true"
          className={`block h-full ${creditLine.over_limit ? 'bg-loss-fill' : 'bg-brand-fill'}`}
          style={{ width: `${ratio}%` }}
        />
      </span>
      {creditLine.over_limit ? (
        <span className="text-[11px] text-loss-text inline-flex items-center gap-1 mt-0.5">
          <Icon name="error" size={11} />
          한도 {fmt(Math.abs(creditLine.available))} 초과
        </span>
      ) : (
        <span className="text-[11px] text-caption">여유 {fmt(creditLine.available)}</span>
      )}
    </span>
  );
}

function RepaymentLog({ rows, onDelete }) {
  if (!rows) return null;
  if (!rows.length) {
    return (
      <div className="mt-3">
        <h4 className="text-xs font-medium text-caption mb-1">상환 이력</h4>
        <p className="text-caption text-xs py-2">
          아직 상환 기록이 없어요. 갚은 금액을 넣어 두면 그 시점 이후 이자가 줄어든 것으로 계산돼요.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <h4 className="text-xs font-medium text-caption mb-1">상환 이력</h4>
      <ul className="divide-y divide-line-faint">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
            <span className="text-caption whitespace-nowrap">{r.repaid_on}</span>
            <span className="text-body truncate flex-1">
              원금 {fmt(r.principal_portion)}
              {r.interest_portion > 0 && ` · 이자 ${fmt(r.interest_portion)}`}
              {r.memo && ` · ${r.memo}`}
            </span>
            <span className="text-ink tabular-nums whitespace-nowrap">{fmt(r.amount)}</span>
            <button
              type="button"
              onClick={() => onDelete(r)}
              aria-label={`${r.repaid_on} 상환 기록 삭제`}
              className="shrink-0 text-caption hover:text-loss-text px-1 rounded-full hover:bg-loss-tint"
            >
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RepaymentForm({ debt, onSave, onCancel }) {
  const today = localYMD();
  const [form, setForm] = useState({ repaid_on: today, amount: '', interest_portion: '', memo: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const amount = Number(form.amount) || 0;
  const interest = Number(form.interest_portion) || 0;
  const principal = Math.max(0, amount - interest);

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { repaid_on: form.repaid_on, amount, memo: form.memo };
    // 배분을 적었을 때만 보낸다. 안 적으면 서버가 전액을 원금으로 잡는다 —
    // 이 앱은 이자를 잔액에 편입하므로 그게 보통이다.
    if (form.interest_portion !== '') {
      payload.interest_portion = interest;
      payload.principal_portion = principal;
    }
    onSave(payload);
  };

  const inp = 'w-full bg-surface border border-line-strong rounded-control px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand-fill';

  return (
    <form onSubmit={handleSubmit} className="bg-surface shadow-card rounded-card border border-brand-tint p-5 space-y-4">
      <h2 className="text-sm font-semibold text-body">
        상환 기록 — <span className="text-brand-text">{debt.name}</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label htmlFor="repay-date" className="block text-xs text-caption mb-1">상환일 *</label>
          <input id="repay-date" type="date" className={inp} value={form.repaid_on} onChange={e => set('repaid_on', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="repay-amount" className="block text-xs text-caption mb-1">상환 금액 (원) *</label>
          <input id="repay-amount" type="number" min="1" className={inp} value={form.amount} onChange={e => set('amount', e.target.value)} required />
        </div>
        <div>
          <label htmlFor="repay-interest" className="block text-xs text-caption mb-1">이자분 (원)</label>
          <input id="repay-interest" type="number" min="0" className={inp} placeholder="비우면 전액 원금" value={form.interest_portion} onChange={e => set('interest_portion', e.target.value)} />
        </div>
        <div>
          <label htmlFor="repay-memo" className="block text-xs text-caption mb-1">메모</label>
          <input id="repay-memo" type="text" className={inp} value={form.memo} onChange={e => set('memo', e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-caption">
        원금 {fmt(principal)}만큼 잔액이 줄고, 거래내역에 상환 1건이 만들어져요.
        명세서에 원금·이자가 나뉘어 있으면 이자분을 적어 주세요.
      </p>
      <div className="flex gap-3 pt-1">
        <button type="submit" className="btn-primary text-sm px-5 py-2 rounded-control transition-colors">기록</button>
        <button type="button" onClick={onCancel} className="text-caption hover:text-ink text-sm px-4 py-2 rounded-control hover:bg-surface-sunken transition-colors">
          취소
        </button>
      </div>
    </form>
  );
}

function DebtForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    balance: initial ? String(initial.balance) : '',
    annual_rate: initial ? String(initial.annual_rate) : '',
    type: initial?.type || '일반',
    loan_type: initial?.loan_type || 'general',
    credit_limit: initial?.credit_limit != null ? String(initial.credit_limit) : '',
    interest_day: initial?.interest_day != null ? String(initial.interest_day) : '',
    memo: initial?.memo || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const visible = loanTypeFields(form.loan_type);

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      type: form.type,
      memo: form.memo,
      loan_type: form.loan_type,
      balance: Number(form.balance),
      // 유형에 의미 없는 값은 보내지 않는다. 유형을 바꾸기 전에 적어둔 값이
      // 남아 있으면 서버가 엉뚱한 조합을 저장한다.
      credit_limit: visible.credit_limit && form.credit_limit !== '' ? Number(form.credit_limit) : null,
      interest_day: visible.interest_day && form.interest_day !== '' ? Number(form.interest_day) : null,
    };
    // 금리는 등록할 때만 받는다. 수정에서 보내면 이력과 어긋난다 — 서버도
    // PUT 에서는 금리를 건드리지 않는다(#285).
    if (!initial) {
      payload.annual_rate = form.annual_rate ? Number(form.annual_rate) : 0;
    }
    onSave(payload);
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
          <label htmlFor="debt-loan-type" className="block text-xs text-caption mb-1">이자 계산 방식</label>
          <select id="debt-loan-type" className={inp} value={form.loan_type} onChange={e => set('loan_type', e.target.value)}>
            {LOAN_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-[11px] text-caption mt-1">{loanTypeHint(form.loan_type)}</p>
        </div>
        {visible.credit_limit && (
          <div>
            <label htmlFor="debt-credit-limit" className="block text-xs text-caption mb-1">한도 (원) *</label>
            <input id="debt-credit-limit" type="number" min="1" className={inp} required value={form.credit_limit} onChange={e => set('credit_limit', e.target.value)} />
          </div>
        )}
        {visible.interest_day && (
          <div>
            <label htmlFor="debt-interest-day" className="block text-xs text-caption mb-1">이자 결제일</label>
            <input id="debt-interest-day" type="number" min="1" max="31" className={inp} placeholder="예: 25" value={form.interest_day} onChange={e => set('interest_day', e.target.value)} />
          </div>
        )}
        {/* 금리는 등록할 때만 여기서 받는다. 이후 변경은 시점이 붙어야 해서
            금리 이력 화면으로 들어간다(#285). */}
        {!initial ? (
          <div>
            <label htmlFor="debt-annual-rate" className="block text-xs text-caption mb-1">연이율 (%)</label>
            <input id="debt-annual-rate" type="number" step="0.01" className={inp} placeholder="0" value={form.annual_rate} onChange={e => set('annual_rate', e.target.value)} />
          </div>
        ) : (
          <div>
            <span className="block text-xs text-caption mb-1">연이율 (%)</span>
            <p className="text-sm text-body py-2">
              연 {initial.annual_rate}%
              <span className="text-caption text-xs"> · 금리 변경은 아래 「금리 이력」에서</span>
            </p>
          </div>
        )}
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
