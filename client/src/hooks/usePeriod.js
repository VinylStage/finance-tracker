import { useCallback, useEffect, useState } from 'react';
import { parsePeriodQuery, toPeriodQuery } from '../lib/periodFilter';

// 기간 상태를 URL 에서 읽고 URL 에 쓴다(#272).
//
// ─────────────────────────────────────────────────────────────────────────
// URL 이 정본인 이유
//
// 컴포넌트 state 를 정본으로 두면 새로고침에 사라지고, 뒤로가기가 안 먹고,
// 링크를 공유해도 상대는 다른 기간을 본다. 기간은 **사용자가 지금 무엇을 보고
// 있는지**를 정하는 값이라 주소에 있어야 한다.
//
// Dashboard 의 readHeatPeriod/writeHeatPeriod 가 쓰는 방식과 같다 —
// window.location + history. 다만 여기는 기간이 **탐색**이라 replaceState 가
// 아니라 pushState 를 쓴다. 사용자가 "지난 달" 을 눌렀다가 뒤로가기로 돌아올
// 수 있어야 한다(인수 기준).
//
// ─────────────────────────────────────────────────────────────────────────
// popstate 를 듣는다
//
// pushState 를 쓰면 뒤로가기가 URL 만 바꾸고 리렌더를 안 일으킨다. popstate 에서
// 다시 읽어야 화면이 따라온다. 이걸 빼면 주소는 바뀌는데 숫자가 안 바뀐다 —
// 가장 알아채기 어려운 종류의 버그다.

function readFromLocation() {
  if (typeof window === 'undefined') return parsePeriodQuery('');
  return parsePeriodQuery(window.location.search);
}

export function usePeriod() {
  const [period, setPeriodState] = useState(readFromLocation);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const sync = () => setPeriodState(readFromLocation());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const setPeriod = useCallback((next) => {
    const merged = { ...readFromLocation(), ...next };
    setPeriodState(parsePeriodQuery(toPeriodQuery(merged)));

    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const query = toPeriodQuery(merged);
    // 기간 키만 갈아끼운다. 히트맵 등 다른 컨트롤이 실어 둔 파라미터를 날리면
    // 기간을 바꿨는데 아래쪽 차트가 초기화된다.
    for (const key of ['from', 'to', 'month', 'derived']) url.searchParams.delete(key);
    for (const [k, v] of new URLSearchParams(query.replace(/^\?/, ''))) {
      url.searchParams.set(k, v);
    }
    window.history.pushState(null, '', url);
  }, []);

  return { period, setPeriod };
}
