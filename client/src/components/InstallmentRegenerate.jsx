import React, { useState } from 'react';
import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';
import Icon from './Icon';

// 할부 청구 내역(파생 거래) 생성·재계산(#269).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 화면이 필요한가
//
// #269 는 마이그레이션이 기존 할부에 파생 거래를 **자동으로 만들지 않게** 했다.
// 그게 ADR 0008 이 막는 "조용한 대량 변경" 이기 때문이다. 그래서 API 는 있지만
// 사용자가 들어올 자리가 없었다 — 실사용 DB 의 기존 할부 3건에 아직 청구 내역이 없다.
//
// 이 컴포넌트가 그 자리다. 프리뷰(DB 불변) → 확인 → 실행 2단계를 그대로 따른다.
// ─────────────────────────────────────────────────────────────────────────
//
// 프리뷰가 보여야 할 것(ADR 0008): 건수, 전 → 후, 부작용, 되돌릴 수 있는가.

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

function signed(n) {
  if (n === 0) return '변화 없음';
  return `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
}

// 되돌리는 방법을 사실대로 적는다. M12(#300) 전까지는 실행취소가 없다.
const REVERSIBLE_TEXT = {
  backup: '되돌리려면 백업에서 복원해야 해요. 실행취소는 아직 없어요.',
  undo: '실행취소로 한 번에 되돌릴 수 있어요.',
};

export default function InstallmentRegenerate({ installment, hasDerived, onDone }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { alert } = useConfirm();

  const label = hasDerived ? '청구 내역 다시 계산' : '청구 내역 만들기';

  const handlePreview = async () => {
    setBusy(true);
    setError(null);
    try {
      // 프리뷰는 DB 를 바꾸지 않는다. 본문을 비워 현재 값 기준으로 계산한다.
      const res = await api.post(`/api/installments/${installment.id}/derived/preview`, {});
      setPlan(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/api/installments/${installment.id}/derived/apply`, {
        preview_token: plan.fingerprint,
      });
      setPlan(null);
      await alert(`청구 내역 ${res.created}건을 만들었어요.${res.deleted ? ` (이전 ${res.deleted}건은 지웠어요)` : ''}`);
      onDone?.();
    } catch (err) {
      // 409 는 프리뷰 이후 원본이 바뀐 경우다. 다시 보고 판단하도록 계획을 지운다.
      setPlan(null);
      await alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="py-2">
        <p role="alert" className="text-xs text-loss-text">{error}</p>
        <button type="button" onClick={handlePreview} className="text-xs text-brand-text mt-1">
          다시 시도
        </button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="py-2">
        <button
          type="button" onClick={handlePreview} disabled={busy}
          className="text-xs text-brand-text hover:underline disabled:opacity-60"
        >
          {busy ? '계산 중...' : label}
        </button>
        {!hasDerived && (
          <p className="text-[11px] text-caption mt-1">
            할부를 등록하기 전에 만들어진 할부라 청구 내역이 아직 없어요. 만들기 전에
            무엇이 생기는지 먼저 보여드릴게요.
          </p>
        )}
      </div>
    );
  }

  const pastAffected = plan.past_affected || [];

  return (
    <div className="py-3 space-y-2 border-t border-line-faint mt-2">
      <h4 className="text-xs font-medium text-body">이렇게 바뀝니다</h4>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-caption">지워질 회차</dt>
        <dd className="text-ink tabular-nums">{plan.delete_count}건</dd>
        <dt className="text-caption">새로 생길 회차</dt>
        <dd className="text-ink tabular-nums">{plan.create_count}건</dd>
        <dt className="text-caption">합계</dt>
        <dd className="text-ink tabular-nums">
          {fmt(plan.before_total)} → {fmt(plan.after_total)}
          <span className="text-caption"> ({signed(plan.delta)})</span>
        </dd>
        <dt className="text-caption">적용 정책</dt>
        <dd className="text-body">
          {plan.policy_applied
            ? `${plan.policy_applied.policy_type}${plan.policy_applied.annual_rate ? ` 연 ${plan.policy_applied.annual_rate}%` : ''}`
            : '등록된 카드 정책이 없어 기존 월 수수료로 계산해요'}
        </dd>
      </dl>

      {/* 지난 회차가 바뀌는 건 사용자가 가장 놀라는 지점이다. 따로 드러낸다. */}
      {pastAffected.length > 0 && (
        <div className="rounded-control bg-loss-tint/40 px-3 py-2">
          <p className="text-xs text-loss-text inline-flex items-center gap-1">
            <Icon name="error" size={12} />
            이미 지난 청구월 {pastAffected.length}개가 바뀝니다
          </p>
          <ul className="mt-1 space-y-0.5">
            {pastAffected.slice(0, 5).map((m) => (
              <li key={m.billing_month} className="text-[11px] text-body tabular-nums">
                {m.billing_month} · {fmt(m.before)} → {fmt(m.after)}
              </li>
            ))}
            {pastAffected.length > 5 && (
              <li className="text-[11px] text-caption">외 {pastAffected.length - 5}개</li>
            )}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-caption">
        {REVERSIBLE_TEXT[plan.reversible] || REVERSIBLE_TEXT.backup}
      </p>

      <div className="flex gap-2 pt-1">
        <button
          type="button" onClick={handleApply} disabled={busy}
          className="btn-primary text-xs px-3 py-1.5 rounded-control disabled:opacity-60"
        >
          {busy ? '만드는 중...' : '실행'}
        </button>
        <button
          type="button" onClick={() => setPlan(null)} disabled={busy}
          className="text-xs text-caption hover:text-ink px-3 py-1.5 rounded-control hover:bg-surface-sunken"
        >
          취소
        </button>
      </div>
    </div>
  );
}
