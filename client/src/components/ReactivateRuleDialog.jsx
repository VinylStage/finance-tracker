import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { api } from '../lib/api';
import { formatWon } from '../lib/format';

// 꺼둔 반복 규칙을 다시 켤 때 무엇이 생기는지 먼저 보여준다(#489).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 묻는가
//
// 규칙을 다시 켜면 다음 기동의 따라잡기가 **꺼져 있던 구간을 규칙대로 채운다.**
// 사용자는 그 사이 거래가 생기는 것을 고른 적이 없고, 되돌린 순간에는 아무 일도
// 없으므로 **다음 기동 때까지 눈치채지도 못한다.**
//
// `recurringCatchup.js` 의 주석이 «다시 켤 때 공백을 어떻게 할지는 시스템이 정하지 않고
// 사용자에게 묻는다(#279 확정)» 라고 적어 뒀는데 묻는 화면이 없었다. 이 파일이 그 자리다.
//
// 프리뷰는 **DB 를 바꾸지 않는다.** 「프리뷰 → 확인 → 실행」 순서다(CLAUDE.md).

const MODES = [
  {
    id: 'all',
    label: '빠진 기간을 모두 만든다',
    help: '꺼져 있던 동안의 거래를 규칙대로 채웁니다.',
  },
  {
    id: 'from-now',
    label: '지금부터만 만든다',
    help: '빠진 기간은 건너뛰고 다음 회차부터 만듭니다.',
  },
  {
    id: 'from-date',
    label: '고른 날짜부터 만든다',
    help: '규칙의 시작일을 그날로 옮깁니다. 그 앞은 앞으로도 만들지 않습니다.',
  },
];

export default function ReactivateRuleDialog({ rule, onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('all');
  const [startsOn, setStartsOn] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get(`/api/recurring-rules/${rule.id}/reactivation-preview`)
      .then((data) => { if (alive) setPreview(data); })
      // 프리뷰가 실패해도 규칙을 다시 켜는 길은 남겨야 한다 — 다만 **몇 건이 생기는지
      // 모르는 상태**라는 것을 화면이 말한다. 조용히 진행하면 묻는 의미가 없다.
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [rule.id]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/api/recurring-rules/${rule.id}/reactivate`, {
        mode,
        startsOn: mode === 'from-date' ? startsOn : undefined,
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  // 응답이 예상과 달라도 **화면이 죽지 않아야 한다.** 여기서 던지면 설정 화면이 통째로
  // 안 뜬다 — 보조 정보가 본 기능을 막는 자리가 된다(CardEstimateHint 와 같은 원칙).
  const dates = Array.isArray(preview && preview.dates) ? preview.dates : [];
  const count = preview ? (Number.isFinite(preview.count) ? preview.count : dates.length) : null;
  const totalAmount = preview && Number.isFinite(preview.totalAmount) ? preview.totalAmount : 0;
  const canSubmit = !busy && (mode !== 'from-date' || /^\d{4}-\d{2}-\d{2}$/.test(startsOn));

  return (
    <Modal title="반복 규칙을 다시 켤까요?" onClose={onClose} busy={busy}>
      <div className="space-y-4 text-sm">
        <p className="text-body">
          <strong>{rule.merchant}</strong> · 매달 {rule.day_of_month}일 · {formatWon(rule.amount)}
        </p>

        {error && (
          <p className="text-loss-text text-xs">
            {error} — 몇 건이 생기는지 확인하지 못했어요.
          </p>
        )}

        {!preview && !error && <p className="text-caption text-xs">확인하는 중이에요…</p>}

        {preview && (
          count === 0 ? (
            <p className="text-caption text-xs">
              빠진 기간에 만들 거래가 없어요. 지금 켜도 새로 생기는 것은 없습니다.
            </p>
          ) : (
            <div className="rounded-control border border-line bg-surface-page px-3 py-2 space-y-1">
              <p className="text-body text-xs">
                지금 켜면 <strong>{count}건</strong>이 새로 생겨요 · 합계 {formatWon(totalAmount)}
              </p>
              {dates.length > 0 && (
                <p className="text-caption text-[11px]">
                  {dates[0]} ~ {dates[dates.length - 1]}
                </p>
              )}
            </div>
          )
        )}

        <fieldset className="space-y-2">
          <legend className="text-caption text-xs mb-1">어떻게 켤까요?</legend>
          {MODES.map((m) => (
            <label key={m.id} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="reactivate-mode"
                value={m.id}
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
                className="mt-1"
              />
              <span>
                <span className="text-body text-xs">{m.label}</span>
                <span className="block text-caption text-[11px]">{m.help}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {mode === 'from-date' && (
          <label className="block">
            <span className="block text-xs text-caption mb-1" htmlFor="reactivate-starts-on">
              언제부터 만들까요?
            </span>
            <input
              id="reactivate-starts-on"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              className="w-full rounded-control border border-line px-2 py-1.5 text-sm"
            />
          </label>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-control bg-brand-fill px-3 py-1.5 text-sm text-on-brand disabled:opacity-50"
          >
            {busy ? '켜는 중…' : '다시 켜기'}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="px-3 py-1.5 text-sm text-caption">
            취소
          </button>
        </div>
      </div>
    </Modal>
  );
}
