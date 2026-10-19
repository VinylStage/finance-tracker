import { useCallback, useEffect, useRef, useState } from 'react';

// 로딩·에러 상태와 재조회 함수를 제공하는 공용 훅.
//
// 각 페이지가 반복하던 아래 보일러플레이트를 대체한다:
//   const [loading, setLoading] = useState(true);
//   const load = useCallback(() => { setLoading(true); fetch(...).then(set).catch(() => setLoading(false)); }, deps);
//   useEffect(() => { load(); }, [load]);
//
// 데이터 반영(setState)은 loadFn 안에서 컴포넌트가 직접 한다. 페이지마다 응답을
// 여러 개의 state 로 분해해 담기 때문에(예: items + total + paymentMethods) 단일
// data 로 묶기보다 이 방식이 기존 구조를 최소 변경으로 유지한다.
//
// loadFn 이 throw 하면(주로 ApiError) error 에 담고 loading 은 해제된다.
// deps 가 바뀌면 자동으로 재조회한다. 이벤트 이후 갱신은 reload() 를 호출한다.
//
// ── 늦게 도착한 옛 응답의 데이터 반영 (#737)
//
// 아래 시퀀스 가드는 loading·error 만 지킨다. loadFn 안에서 바로 setState 하면
// 그 반영은 가드보다 먼저 일어나서, deps 가 빠르게 바뀔 때 옛 응답이 새 데이터를
// 덮는다. 막으려면 반영을 **함수로 돌려준다** — 그 요청이 아직 최신일 때만 부른다.
//
//   useLoader(async (isCurrent) => {
//     const res = await api.get(...);
//     return () => setRows(res.data);   // 최신일 때만 실행된다
//   }, [filter]);
//
// isCurrent() 는 기다린 뒤(디바운스 등) 부를 필요가 남았는지 볼 때 쓴다.
// 아무것도 돌려주지 않는 기존 loadFn 은 지금까지와 같다.
export function useLoader(loadFn, deps = []) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // 최신 요청만 상태에 반영하기 위한 시퀀스 가드.
  // deps 가 빠르게 바뀌거나 뮤테이션 직후 재조회가 겹칠 때, 늦게 도착한 오래된
  // 응답이 최신 응답을 덮어쓰는 경쟁 조건을 막는다.
  const seq = useRef(0);
  // 한 번이라도 성공했는지. 재조회(필터 변경·뮤테이션 후) 실패가 이미 보여주던
  // 화면을 통째로 에러로 덮지 않도록, 전면 에러는 '최초 로드 실패'에만 적용한다.
  // (develop 의 기존 동작 = 재조회 실패 시 직전 데이터를 유지)을 보존하면서,
  // 최초 로드 실패에는 에러 UI 를 제공한다.
  const loadedOnce = useRef(false);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    const isCurrent = () => id === seq.current;
    setLoading(true);
    setError(null);
    try {
      const apply = await loadFn(isCurrent);
      if (id !== seq.current) return;          // 더 최신 요청이 진행 중 → 이 결과는 버린다
      if (typeof apply === 'function') apply();
      loadedOnce.current = true;
    } catch (err) {
      if (id !== seq.current) return;          // 오래된 실패가 최신 성공을 덮지 않도록
      if (!loadedOnce.current) setError(err);  // 최초 로드 실패만 전면 에러로 노출
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // loadFn 은 매 렌더 새로 생성되므로 deps 로만 갱신을 제어한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { reload(); }, [reload]);
  // 언마운트 뒤에 끝난 요청은 아무것도 반영하지 않는다.
  useEffect(() => () => { seq.current += 1; }, []);

  return { loading, error, reload };
}
