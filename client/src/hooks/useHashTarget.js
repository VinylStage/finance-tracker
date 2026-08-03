import { useEffect } from 'react';

// 거래내역에서 "부채관리에서 수정" 을 눌러 넘어왔을 때 그 항목을 찾아준다(#270).
//
// 앵커(#installment-3)만 붙여 두면 SPA 안에서는 아무 일도 일어나지 않는다.
// 브라우저의 해시 스크롤은 첫 로드 때 한 번 동작하고, 그 시점에 목록은 아직
// 비어 있다. 그래서 데이터가 들어온 뒤(ready) 직접 찾아 옮긴다.
//
// 목록이 길면 화면만 옮겨서는 어느 줄인지 모른다. 해당 항목을 펼쳐 준다.
export function useHashTarget(prefix, ready, onFound) {
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (!hash.startsWith(`${prefix}-`)) return;

    const id = Number(hash.slice(prefix.length + 1));
    if (!Number.isInteger(id) || id <= 0) return;

    onFound(id);
    // 펼쳐진 뒤에 위치를 잡아야 한다. 같은 프레임에 재면 접힌 높이를 기준으로
    // 스크롤해 항목이 화면 밖으로 밀린다.
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ block: 'center' });
    });
    // ready 가 true 로 바뀌는 순간 한 번만 돈다. onFound 는 setState 라 참조가
    // 안정적이므로 의존성에 넣지 않는다 — 넣으면 매 렌더마다 다시 펼친다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, ready]);
}
