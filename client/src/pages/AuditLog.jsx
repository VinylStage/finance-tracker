import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../lib/api';
import { useLoader } from '../hooks/useLoader';
import LoadError from '../components/LoadError';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import {
  diffFields, labelForField, fieldName,
  ACTOR_LABELS, describeAction,
} from '../lib/auditFormat';

// 감사 이력 화면(#301).
//
// 기본은 **사용자 작업만** 보여준다. 조회 때마다 도는 시스템 스윕(#205)이
// 목록을 뒤덮어, 전체를 켜면 사용자가 자기 작업을 찾을 수 없다.

const PAGE = 50;


export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [actor, setActor] = useState('user');
  const [expanded, setExpanded] = useState(new Set());
  const [lookups, setLookups] = useState({ categories: {}, paymentMethods: {} });
  const [undoError, setUndoError] = useState(null);

  const load = useCallback(async () => {
    const [log, cats, pms] = await Promise.all([
      api.get(`/api/audit/log?actor=${actor}&limit=${PAGE}&offset=${offset}`),
      api.get('/api/categories'),
      api.get('/api/payment-methods'),
    ]);
    setRows(log.data || []);
    setTotal(log.total || 0);
    // id 를 이름으로 바꾸려면 매핑이 필요하다. 사용자는 id 를 모른다.
    setLookups({
      categories: Object.fromEntries((cats.data || cats).map((c) => [c.id, c.name])),
      paymentMethods: Object.fromEntries((pms.data || pms).map((p) => [p.id, p.name])),
    });
  }, [actor, offset]);

  const { loading, error, reload } = useLoader(load, [actor, offset]);

  useEffect(() => { setOffset(0); setExpanded(new Set()); }, [actor]);

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const undo = async (actionId) => {
    setUndoError(null);
    try {
      await api.post('/api/audit/undo', { action_id: actionId });
      reload();
    } catch (e) {
      setUndoError(e.message || '되돌리지 못했어요. 값을 확인한 뒤 다시 시도해 주세요.');
    }
  };

  const pages = Math.ceil(total / PAGE) || 1;
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">변경 이력</h1>
        <div className="flex gap-1" role="group" aria-label="작업 주체 필터">
          {['user', 'system', 'import', 'all'].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setActor(a)}
              aria-pressed={actor === a}
              className={`text-xs px-3 py-1 rounded-chip border transition-colors ${
                actor === a
                  ? 'bg-brand-tint border-brand-tint-strong text-brand-text'
                  : 'border-line text-caption hover:bg-surface-page'
              }`}
            >
              {a === 'all' ? '전체' : ACTOR_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      {undoError && (
        <div className="bg-surface border border-line rounded-card px-4 py-3 text-sm text-loss-text" role="alert">
          {undoError}
        </div>
      )}

      {loading ? (
        <div className="text-caption text-center py-10">로딩 중...</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Icon name="history" size={32} />}
          title="아직 기록이 없어요"
          description="거래를 추가하거나 고치면 여기에 남습니다. 되돌리기도 여기서 할 수 있어요."
        />
      ) : (
        <>
          <div className="bg-surface shadow-card rounded-card border border-line divide-y divide-line">
            {rows.map((r) => {
              const fields = diffFields(r.before_json, r.after_json);
              const isOpen = expanded.has(r.id);
              return (
                <div key={r.id} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    className="w-full flex flex-wrap items-center justify-between gap-2 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm text-ink">
                      {describeAction({ label: r.action_label, tables: [r.table_name], ops: [r.op] })}
                      {r.undone_at && (
                        <span className="text-xs text-caption ml-2">되돌림</span>
                      )}
                    </span>
                    <span className="text-xs text-caption tabular-nums">
                      {ACTOR_LABELS[r.actor] || r.actor} · {r.ts}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mt-2 pt-2 border-t border-line">
                      {fields.length === 0 ? (
                        <div className="text-xs text-caption">표시할 변경 내용이 없어요.</div>
                      ) : (
                        <dl className="text-xs space-y-1">
                          {fields.map((f) => (
                            <div key={f.key} className="flex flex-wrap gap-2">
                              <dt className="text-caption min-w-20">{fieldName(f.key)}</dt>
                              <dd className="text-body">
                                {/* JSON 을 그대로 뱉지 않는다. id 는 이름으로 바꾼다. */}
                                <span className="text-caption">{labelForField(f.key, f.before, lookups)}</span>
                                <span className="mx-1">→</span>
                                <span>{labelForField(f.key, f.after, lookups)}</span>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}

                      {/* 되돌리기는 사용자 작업이고 아직 안 되돌린 것에만 낸다.
                          시스템·불러오기 작업에 버튼을 내면 눌렀다가 거부된다. */}
                      {r.actor === 'user' && !r.undone_at && (
                        <button
                          type="button"
                          onClick={() => undo(r.action_id)}
                          className="mt-2 text-xs px-2 py-1 rounded-chip border border-line text-caption hover:bg-surface-page"
                        >
                          이 작업 되돌리기
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 불러오기 한 번이 수백 행을 만들 수 있어 페이지를 나눈다. */}
          {total > PAGE && (
            <div className="flex items-center justify-between text-xs text-caption">
              <button
                type="button"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
                disabled={offset === 0}
                className="px-3 py-1 rounded-chip border border-line disabled:opacity-40"
              >
                이전
              </button>
              <span className="tabular-nums">{page} / {pages} · 전체 {total}건</span>
              <button
                type="button"
                onClick={() => setOffset((o) => o + PAGE)}
                disabled={offset + PAGE >= total}
                className="px-3 py-1 rounded-chip border border-line disabled:opacity-40"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
