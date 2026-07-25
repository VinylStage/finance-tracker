import { useCallback, useEffect, useState } from 'react';

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
// loadFn 이 throw 하면(주로 ApiError) error 에 담기고 loading 은 해제된다.
// deps 가 바뀌면 자동으로 재조회한다. 이벤트 이후 갱신은 reload() 를 호출한다.
export function useLoader(loadFn, deps = []) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadFn();
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // loadFn 은 매 렌더 새로 생성되므로 deps 로만 갱신을 제어한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { reload(); }, [reload]);

  return { loading, error, reload };
}
