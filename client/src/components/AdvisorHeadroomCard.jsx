import React, { useState } from 'react';
import { api } from '../lib/api';
import { useLoader } from '../hooks/useLoader';
import { formatWon } from '../lib/format';

// 이번 청구주기 여윳돈 — "다음 결제일까지 카드로 더 써도 되는 돈" (스펙 B).
//
// 대시보드 상단 「가용 현금」(이번달 수입−지출)과 다른 질문에 답한다: 지금 통장
// 잔액(보유현금 앵커)에서 출발해 월급·고정비·아직 안 낸 카드값·할부 회차를 날짜
// 순으로 지나갈 때, 새로 긁는 카드값을 내고도 다음 월급 전까지 버티는 한도.
//
// 신용카드(다음 결제일에 빠짐)와 체크카드·현금(지금 빠짐)은 한도가 다르다.
// 계산은 서버(/api/advisor/headroom)가 한다.

const UNPAID_KEY = 'advisor.unpaidCards';

function readUnpaid() {
  try { return JSON.parse(window.localStorage.getItem(UNPAID_KEY) || '[]'); } catch { return []; }
}
function writeUnpaid(list) {
  try { window.localStorage.setItem(UNPAID_KEY, JSON.stringify(list)); } catch { /* 저장 불가 환경 */ }
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const md = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '');

function AnchorForm({ onSaved, initial }) {
  const [date, setDate] = useState(initial?.as_of_date || today());
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [err, setErr] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api.post('/api/advisor/anchor', { as_of_date: date, amount: Number(amount) });
      onSaved();
    } catch (ex) { setErr(ex.message || '저장하지 못했습니다.'); }
  };
  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-2 text-sm" aria-label="보유현금 입력">
      <label className="flex flex-col text-caption text-xs">기준일
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-line rounded px-2 py-1 text-ink" />
      </label>
      <label className="flex flex-col text-caption text-xs">통장 잔액(원)
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ''))} className="border border-line rounded px-2 py-1 text-ink w-36" placeholder="예: 1000000" />
      </label>
      <button type="submit" className="px-3 py-1 rounded bg-brand-fill text-white">저장</button>
      {err && <span className="text-loss-text text-xs">{err}</span>}
    </form>
  );
}

export default function AdvisorHeadroomCard() {
  const [unpaid, setUnpaid] = useState(readUnpaid);
  const [data, setData] = useState(null);
  const [needAnchor, setNeedAnchor] = useState(false);
  const [editAnchor, setEditAnchor] = useState(false);
  const [cards, setCards] = useState([]);

  const { error, reload } = useLoader(async () => {
    const pms = await api.get('/api/payment-methods');
    setCards((Array.isArray(pms) ? pms : []).filter((p) => p.type === '신용' && p.is_active !== 0).map((p) => p.name));
    try {
      const q = unpaid.length ? `?unpaid=${encodeURIComponent(unpaid.join(','))}` : '';
      const d = await api.get(`/api/advisor/headroom${q}`);
      setNeedAnchor(false);
      setData(d && typeof d.capacity === 'number' ? d : null);
    } catch (ex) {
      if (ex && ex.status === 409) { setNeedAnchor(true); setData(null); return; }
      throw ex;
    }
  }, [unpaid.join(',')]);

  const toggle = (name) => {
    const next = unpaid.includes(name) ? unpaid.filter((n) => n !== name) : [...unpaid, name];
    writeUnpaid(next);
    setUnpaid(next);
  };

  if (error) return null; // 대시보드 다른 섹션을 막지 않는다
  if (needAnchor) {
    return (
      <section className="bg-surface shadow-card rounded-card p-5 border border-line" aria-label="이번 주기 여윳돈">
        <h2 className="text-sm font-semibold text-body mb-1">이번 주기 여윳돈</h2>
        <p className="text-caption text-xs mb-3">계산하려면 오늘 통장 잔액(카드값 이미 낸 뒤)을 넣어 주세요.</p>
        <AnchorForm onSaved={reload} />
      </section>
    );
  }
  if (!data) return null;

  const credit = data.capacity;
  const immediate = data.capacityImmediate;
  return (
    <section className="bg-surface shadow-card rounded-card p-5 border border-line space-y-3" aria-label="이번 주기 여윳돈">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-body">이번 주기 여윳돈</h2>
        <span className="text-caption text-xs">
          {md(data.asOf)} 잔액 {formatWon(data.anchorAmount)} 기준 ·{' '}
          <button type="button" className="underline" onClick={() => setEditAnchor((v) => !v)}>잔액 수정</button>
        </span>
      </div>
      {editAnchor && <AnchorForm initial={{ as_of_date: today(), amount: data.anchorAmount }} onSaved={() => { setEditAnchor(false); reload(); }} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-caption text-xs">신용카드로 더 써도 되는 돈</p>
          <p className={`text-2xl font-bold ${credit >= 0 ? 'text-brand-text' : 'text-loss-text'}`} data-testid="headroom-credit">{formatWon(credit)}</p>
          <p className="text-caption text-xs">{md(data.spendDate)} 결제 후 {md(data.target)}까지 버팀</p>
        </div>
        <div>
          <p className="text-caption text-xs">체크카드·현금으로 지금 쓸 수 있는 돈</p>
          <p className={`text-2xl font-bold ${immediate >= 0 ? 'text-ink' : 'text-loss-text'}`} data-testid="headroom-immediate">{formatWon(immediate)}</p>
          <p className="text-caption text-xs">가장 낮은 날 {md(data.minDate)}</p>
        </div>
      </div>

      {cards.length > 0 && (
        <div className="text-xs">
          <p className="text-caption mb-1">아직 결제 전인 카드(체크하면 그 카드 사용분을 결제일에 뺀다)</p>
          <div className="flex flex-wrap gap-1">
            {cards.map((c) => (
              <button key={c} type="button" onClick={() => toggle(c)} aria-pressed={unpaid.includes(c)}
                className={`px-2 py-0.5 rounded-full border ${unpaid.includes(c) ? 'bg-brand-tint text-brand-text border-brand-text' : 'border-line text-caption'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.scheduled?.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-caption">예정된 카드 청구·할부 {data.scheduled.length}건</summary>
          <ul className="mt-1 space-y-0.5">
            {data.scheduled.map((s) => (
              <li key={`${s.date}-${s.label}`} className="flex justify-between gap-2"><span>{md(s.date)} {s.label}</span><span>{formatWon(s.amount)}</span></li>
            ))}
          </ul>
        </details>
      )}
      {data.warnings?.length > 0 && <p className="text-xs text-loss-text">{data.warnings.join(' · ')}</p>}
    </section>
  );
}
