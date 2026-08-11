import React, { useState } from 'react';
import { api } from '../lib/api';
import Icon from './Icon';

// 데이터 점검 리포트(#445, #122).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 화면이 필요했나
//
// `#122` 가 "데이터 무결성 점검 **리포트**(읽기 전용)" 로 `GET /api/data-integrity`
// 를 냈는데 **그것을 볼 화면이 없었다.** 감사(#444)가 "클라이언트가 안 부르는
// 엔드포인트" 로 잡아낸 다섯 건 중 하나다.
//
// 리포트가 서버에만 있으면 문제를 아는 사람이 아무도 없다. 임포트가 이상한
// 날짜를 넣었거나 카테고리가 고아가 돼도 화면 어디에도 안 나타난다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 자동으로 안 돌리나
//
// 점검은 질의 일곱 개고 그중 여럿이 `transactions` 전체를 훑는다. 설정 화면은
// 이미 열 때 네 가지를 부르는데, 여기에 전체 스캔을 얹으면 **점검을 볼 생각이
// 없는 사람도 그 비용을 낸다.**
//
// 진단 도구는 물어볼 때 답하면 된다. 버튼을 눌러야 돈다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 고치는 버튼이 없나
//
// **읽기 전용이다.** 여기 걸리는 것들은 자동으로 고칠 수 없다 — 이상한 날짜가
// 무엇이었어야 하는지, 중복 승인번호 중 어느 쪽이 진짜인지는 사람만 안다.
// 이 저장소는 실거래 2,212건 유실 사고가 있었고, 짐작으로 고치는 동작을 여기에
// 붙이지 않는다.
//
// 대신 **어느 행인지(id)** 를 보여준다. 거래 화면에서 그 건을 찾아 고치면 된다.

// 표본 한 건을 사람이 읽는 줄로 바꾼다.
//
// 점검마다 표본의 모양이 다르다(`{id, date}` · `{id, amount}` ·
// `{approval_number, count}`). 점검별로 렌더러를 따로 두면 서버에 점검이 하나
// 늘 때마다 화면도 같이 고쳐야 하고, 안 고치면 그 점검만 조용히 안 보인다.
// 그래서 키를 그대로 훑는다.
export function describeSample(sample) {
  if (sample === null || sample === undefined) return '';
  if (typeof sample !== 'object') return String(sample);
  return Object.entries(sample)
    .map(([key, value]) => `${key} ${value === null ? '(없음)' : value}`)
    .join(' · ');
}

export default function DataIntegritySection() {
  const [checks, setChecks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/data-integrity');
      setChecks(res.checks || []);
    } catch (e) {
      setError(e.message || '점검하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 걸린 것이 하나도 없을 때와 아직 안 돌렸을 때는 다른 상태다. 둘을 같게
  // 보여주면 "점검했는데 깨끗하다" 를 알 수 없다.
  const problems = checks === null ? [] : checks.filter((c) => c.count > 0);

  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-body">데이터 점검</h2>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-control border border-line text-caption hover:bg-surface-page disabled:opacity-50"
        >
          {loading ? '점검 중' : (checks === null ? '점검하기' : '다시 점검')}
        </button>
      </div>

      <p className="text-xs text-caption leading-relaxed">
        불러온 내역에 이상한 값이 섞여 있는지 훑어봅니다. 여기서 고치지는 않아요 —
        어느 건인지 알려 드리면 거래 화면에서 직접 고치시면 됩니다.
      </p>

      {error && <p className="text-xs text-loss-text">{error}</p>}

      {checks !== null && problems.length === 0 && (
        <p className="text-sm text-body flex items-center gap-2">
          <Icon name="check_circle" className="text-caption" />
          이상한 값이 없어요. {checks.length}가지를 봤습니다.
        </p>
      )}

      {problems.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-caption">
            {checks.length}가지 중 {problems.length}가지에서 걸렸어요.
          </p>
          <ul className="space-y-3">
            {problems.map((check) => (
              <li key={check.name} className="border border-line rounded-card p-3">
                <p className="text-sm text-ink flex flex-wrap items-center gap-2">
                  <Icon name="error" className="text-loss-text" />
                  {check.name}
                  <span className="text-xs text-caption tabular-nums">{check.count}건</span>
                </p>
                {check.samples && check.samples.length > 0 && (
                  <>
                    {/* 서버가 표본을 20건까지만 준다. 그 사실을 안 적으면
                        "20건이 전부" 로 읽힌다. */}
                    <p className="text-[11px] text-caption mt-2">
                      {check.count > check.samples.length
                        ? `앞의 ${check.samples.length}건만 보여요`
                        : '해당 건'}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {check.samples.map((sample, i) => (
                        <li key={i} className="text-xs text-body tabular-nums">
                          {describeSample(sample)}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
