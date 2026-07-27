// 컴포넌트 테스트 공통 셋업(#212).
//
// jsdom 은 브라우저가 아니라서 앱이 쓰는 API 중 일부가 없다. 테스트마다
// 개별로 심으면 빠뜨리는 곳이 생기므로 여기서 한 번에 채운다.
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// recharts 가 컨테이너 크기를 재는 데 쓴다. jsdom 에는 없어서 차트가 0×0 으로
// 렌더되고 자식이 아예 그려지지 않는다.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 다크모드 토글과 반응형 분기가 쓴다. jsdom 기본값은 undefined 다.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
}

// 테스트가 서로의 DOM 을 물려받지 않게 한다.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});
