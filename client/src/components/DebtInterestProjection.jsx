import React, { useState } from 'react';
import { api } from '../lib/api';
import { localYMD } from '../lib/date';
import { supportsProjection } from '../lib/loanType';

// 기간 이자 계산 결과(#329).
//
// **읽기 전용이다.** 이자를 실제로 기록하는 것은 "이자 추가" 이고, 여기서는 "이
// 기간에 얼마가 붙는가" 만 보여준다(#286).
//
// 구간이 **잔액 변동점과 금리 변경점 양쪽에서** 갈린다. 그 구간을 그대로 보여주는
// 이유는 숫자만 보면 왜 그 값인지 알 수 없기 때문이다 — 상환을 언제 했는지, 금리가
// 언제 바뀌었는지가 금액의 근거다.

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

// 이번 달 1일 ~ 오늘. 기본값을 넓게 잡으면 첫 조회부터 느리고, 좁게 잡으면
// 아무것도 안 나온다.
function defaultRange() {
  const today = localYMD();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export default function DebtInterestProjection({ debt }) {
  const [range, setRange] = useState(defaultRange);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // 지원 여부는 서버가 내려준 계산 설정으로 판정한다. 화면이 유형 목록을 다시
  // 만들면 서버와 어긋난다.
  if (!supportsProjection(debt)) {
    return (
      <p className="text-xs text-caption mt-3">
        이 부채는 기간별 이자 계산을 지원하지 않아요. 마이너스통장으로 등록하면 날짜
        단위로 계산할 수 있어요.
      </p>
    );
  }

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.get(
        `/api/debts/${debt.id}/interest-projection?from=${range.from}&to=${range.to}`
      );
      setResult(res.data);
    } catch (err) {
      // 금리 이력이 없는 구간은 서버가 사유를 준다. 0원으로 보여주면 이자가
      // 없는 것처럼 읽힌다.
      setResult(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3">
      <h4 className="text-xs font-medium text-caption mb-1">기간 이자 계산</h4>

      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label htmlFor="proj-from" className="block text-xs text-caption mb-1">시작</label>
          <input
            id="proj-from" type="date"
            className="bg-surface border border-line-strong rounded-control px-2 py-1.5 text-sm text-ink"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="proj-to" className="block text-xs text-caption mb-1">종료</label>
          <input
            id="proj-to" type="date"
            className="bg-surface border border-line-strong rounded-control px-2 py-1.5 text-sm text-ink"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </div>
        <button
          type="button" onClick={run} disabled={busy}
          className="text-xs text-brand-text hover:underline px-2 py-1.5 disabled:opacity-60"
        >
          {busy ? '계산 중...' : '계산'}
        </button>
      </div>

      <p className="text-[11px] text-caption mt-1">
        계산만 해봐요. 이자가 기록되거나 잔액이 바뀌지는 않아요.
      </p>

      {error && <p role="alert" className="text-xs text-loss-text mt-2">{error}</p>}

      {result && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-ink">
            이 기간 이자 <span className="tabular-nums font-medium">{fmt(result.total_interest)}</span>
            {result.capitalized > 0 && (
              <span className="text-caption"> · 잔액에 더해진 이자 {fmt(result.capitalized)}</span>
            )}
          </p>

          {result.postings.length > 0 && (
            <ul className="divide-y divide-line-faint">
              {result.postings.map((p) => (
                <li key={p.date} className="py-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-caption whitespace-nowrap">{p.date}</span>
                    <span className="text-ink tabular-nums">{fmt(p.interest)}</span>
                    <span className="text-caption tabular-nums whitespace-nowrap">
                      {fmt(p.balance_before)} → {fmt(p.balance_after)}
                    </span>
                  </div>
                  {/* 구간이 왜 갈렸는지가 금액의 근거다 — 상환·금리 변경 시점. */}
                  {p.segments.length > 1 && (
                    <ul className="mt-0.5 pl-2">
                      {p.segments.map((s) => (
                        <li key={s.from} className="text-[11px] text-caption tabular-nums">
                          {s.from}~ {s.days}일 · 잔액 {fmt(s.balance)} · 연 {s.annual_rate}% → {fmt(s.interest)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.over_limit && (
                    <p className="text-[11px] text-loss-text mt-0.5">이 시점에 한도를 넘습니다</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {result.accrued_since_last_posting > 0 && (
            <p className="text-[11px] text-caption">
              아직 청구되지 않은 이자 {fmt(result.accrued_since_last_posting)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
