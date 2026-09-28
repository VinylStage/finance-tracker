import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';
import { formatWon } from '../lib/format';
import { evidenceLabel, backfillSummary } from '../lib/cardOverseasView';

// 이미 들어와 있는 결제에 해외 표시를 채운다(#710 · ADR 0010).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 이 자리가 필요한가
//
// 마이그레이션 034 는 칸만 만들고 전부 「국내」 로 뒀다. **추론으로 얻은 값을
// 사람 확인 없이 실거래에 박지 않는다** — 되돌리기가 사람 몫이 된다.
//
// 임포터는 이제 새로 들어오는 결제에 표시를 단다. 그런데 이미 들어와 있는 것은
// 그때 표시가 없었으므로 여기서 채운다. 안 채우면 「해외 N% 적립」 이 과거
// 결제에만 조용히 안 붙는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 프리뷰가 먼저인가 (ADR 0008)
//
// 이 저장소는 과거 실거래 2,212건이 유실된 사고가 있었다. 조용한 대량 변경은
// 같은 범주의 위험이다. 되돌리기가 있어도 **무엇이 바뀌었는지 모르면 되돌릴
// 판단 자체를 못 한다.**
//
// 그래서 건수만 보여주지 않는다. **무엇을 보고 그렇게 판정했는지**(원 통화가
// 찍혔는지, 말미에 국가코드가 붙었는지)를 근거별로 세어 주고 사례를 같이 낸다.
// 「18건이 바뀝니다」 만 보여주는 것은 확인이 아니라 통보다.

export default function CardOverseasSection() {
  const { confirm, alert } = useConfirm();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/card-overseas/backfill/preview');
      setPlan(res);
      setError(null);
    } catch (err) {
      setPlan(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async () => {
    if (!plan || plan.count === 0) return;

    const ok = await confirm(
      `${plan.count}건을 해외결제로 표시할까요? 되돌리기로 되돌릴 수 있어요.`
    );
    if (!ok) return;

    setRunning(true);
    try {
      const res = await api.post('/api/card-overseas/backfill', {
        preview_token: plan.preview_token,
      });
      setDone(res);
      setPlan(null);
      await load();
    } catch (err) {
      // 프리뷰 이후 대상이 달라지면 서버가 막는다(409). 사용자가 본 것과 다른
      // 것을 쓰지 않기 위한 것이므로, 문구를 그대로 보여주고 다시 보게 한다.
      await alert(err.message);
      await load();
    } finally {
      setRunning(false);
    }
  };

  const summary = backfillSummary(plan);

  return (
    <div className="space-y-3">
      <p className="text-xs text-caption">
        카드사 명세서에 <strong className="text-body">해외로 표시된 결제</strong>를 찾아
        표시를 채웁니다. 「해외 N% 적립」 혜택은 이 표시가 있어야 붙어요.
        이름이 영문이라고 해외로 보지는 않아요 — <strong className="text-body">명세서에
        남은 표시</strong>만 읽습니다.
      </p>

      {error && <p className="text-xs text-warn-text">{error}</p>}

      {loading && <p className="text-xs text-caption">확인 중...</p>}

      {!loading && done && (
        <p className="text-xs text-body bg-surface-sunken rounded-card px-3 py-2">
          {done.updated}건을 해외결제로 표시했어요.
          {done.remaining > 0
            ? ` 아직 ${done.remaining}건 남았어요.`
            : ' 남은 것이 없어요.'}
          {' 되돌리기에서 되돌릴 수 있어요.'}
        </p>
      )}

      {!loading && plan && plan.count === 0 && !done && (
        <p className="text-xs text-caption bg-surface-sunken rounded-card px-3 py-2">
          채울 것이 없어요. 명세서에 해외 표시가 있는 결제는 모두 표시돼 있어요.
        </p>
      )}

      {!loading && summary && (
        <div className="bg-surface-sunken rounded-card px-3 py-2 space-y-1.5">
          <p className="text-[11px] font-medium text-body">{summary.headline}</p>
          <p className="text-[11px] text-caption">{summary.evidence}</p>

          <ul className="space-y-0.5 pt-0.5">
            {plan.samples.map((s) => (
              <li key={s.id} className="text-[11px] flex justify-between gap-2 text-caption">
                <span className="truncate">{s.merchant}</span>
                <span className="tabular-nums shrink-0">
                  {evidenceLabel(s.evidence)} · {formatWon(s.amount)}
                </span>
              </li>
            ))}
            {summary.more && <li className="text-[11px] text-caption">{summary.more}</li>}
          </ul>

          <button
            type="button"
            onClick={run}
            disabled={running}
            className="mt-1 px-3 py-1.5 rounded-control bg-brand-fill text-white text-xs font-medium disabled:opacity-50"
          >
            {running ? '채우는 중...' : `${plan.count}건 표시하기`}
          </button>
        </div>
      )}
    </div>
  );
}
