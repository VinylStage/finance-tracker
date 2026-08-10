import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { describeAction } from '../lib/auditFormat';

// 쓰기 직후 되돌리기 스낵바(#301). Gmail 패턴.
//
// #295 는 "완료처리에 확인 대화상자가 없어서" 생긴 일이었다. 실행취소가 생기면
// 확인 대화상자의 대안이 된다 — 매번 묻는 대신 되돌릴 수 있게 한다.
//
// 다만 **되돌릴 수 없는 작업에는 아예 띄우지 않는다.** 눌렀다가 거부되는 것보다
// 처음부터 안 보이는 편이 낫다. 서버가 후보를 주지 않으면 그런 작업이다.
const VISIBLE_MS = 8000;

export default function UndoSnackbar({ trigger, onUndone }) {
  const [candidate, setCandidate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // trigger 가 바뀔 때마다(= 쓰기가 끝날 때마다) 되돌릴 것이 있는지 묻는다.
  useEffect(() => {
    if (!trigger) return undefined;
    let cancelled = false;

    api.get('/api/audit/undoable').then((res) => {
      if (cancelled) return;
      setCandidate(res.undoable || null);
      setError(null);
    }).catch(() => {
      // 스낵바가 안 뜨는 것은 기능 손실이 아니다. 조용히 넘어간다.
      if (!cancelled) setCandidate(null);
    });

    return () => { cancelled = true; };
  }, [trigger]);

  // 일정 시간이 지나면 사라진다. 작업 자체는 감사 이력에 남아 거기서 되돌릴 수 있다.
  useEffect(() => {
    if (!candidate) return undefined;
    const t = setTimeout(() => setCandidate(null), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [candidate]);

  if (!candidate) return null;

  const undo = async () => {
    setBusy(true);
    try {
      await api.post('/api/audit/undo', { action_id: candidate.action_id });
      setCandidate(null);
      onUndone?.();
    } catch (e) {
      // 그 사이 값이 또 바뀐 경우다. 무슨 일이 생겼고 뭘 하면 되는지 말한다.
      setError(e.message || '되돌리지 못했어요. 화면을 새로고침한 뒤 값을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[92vw]"
      // 스크린리더가 놓치지 않도록 알림으로 읽힌다(M4 기준).
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 bg-surface border border-line shadow-card rounded-card px-4 py-3">
        {error ? (
          <>
            <span className="text-sm text-loss-text">{error}</span>
            <button
              type="button"
              onClick={() => { setError(null); setCandidate(null); }}
              className="text-xs px-2 py-1 rounded-chip border border-line text-caption hover:bg-surface-page"
            >
              닫기
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-body">
              {describeAction(candidate)}
              {/* 몇 건이 되돌아가는지 미리 알린다. 큰 작업은 확인하고 눌러야 한다(ADR 0008). */}
              {candidate.affected > 1 && (
                <span className="text-caption text-xs ml-1">{candidate.affected}건</span>
              )}
            </span>
            <button
              type="button"
              onClick={undo}
              disabled={busy}
              className="text-xs px-3 py-1 rounded-chip border border-brand-tint-strong bg-brand-tint text-brand-text disabled:opacity-50"
            >
              {busy ? '되돌리는 중...' : '되돌리기'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
