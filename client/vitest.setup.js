// 컴포넌트 테스트 공통 셋업(#212).
//
// jsdom 은 브라우저가 아니라서 앱이 쓰는 API 중 일부가 없다. 테스트마다
// 개별로 심으면 빠뜨리는 곳이 생기므로 여기서 한 번에 채운다.
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// recharts 가 컨테이너 크기를 재는 데 쓴다. jsdom 에는 없어서 차트가 0×0 으로
// 렌더되고 자식이 아예 그려지지 않는다.
//
// 관찰만 받고 콜백을 부르지 않는 빈 스텁으로는 부족하다. ResponsiveContainer 는
// 콜백이 와야 크기를 알고, 그때까지 SVG 자체를 만들지 않는다. 빈 스텁을 두면
// "차트가 안 그려진다" 는 결함을 테스트가 영영 재현하지 못하고 늘 통과한다.
// 그래서 관찰 즉시 고정 크기를 통보한다.
//
// 다만 이것으로도 차트 내부(막대·선·조각)까지 그려지지는 않는다. 확인해 보면
// SVG 와 레이어까지는 만들어지지만 도형은 비어 있고, 이는 Bar·Line·Pie 가 모두
// 같다. 차트가 실제로 그려지는지는 jsdom 이 아니라 브라우저에서 확인해야 한다.
const OBSERVED = { width: 640, height: 320 };

globalThis.ResizeObserver = class {
  constructor(callback) {
    this.callback = callback;
  }

  observe(target) {
    // 동기로 부르면 React 가 렌더 중에 상태를 바꾼다고 경고한다. 마이크로태스크로 민다.
    Promise.resolve().then(() => {
      this.callback([{ target, contentRect: { ...OBSERVED, top: 0, left: 0, x: 0, y: 0 } }], this);
    });
  }

  unobserve() {}

  disconnect() {}
};

// ResponsiveContainer 는 ResizeObserver 외에 실제 DOM 크기도 함께 읽는다.
// jsdom 은 레이아웃을 하지 않아 전부 0 이므로 같은 값으로 맞춰준다.
for (const [key, value] of Object.entries({
  offsetWidth: OBSERVED.width,
  offsetHeight: OBSERVED.height,
  clientWidth: OBSERVED.width,
  clientHeight: OBSERVED.height,
})) {
  Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value });
}

// jsdom 은 레이아웃이 없어 scrollIntoView 를 아예 구현하지 않는다.
// 해시로 들어온 항목을 찾아 옮기는 useHashTarget 이 requestAnimationFrame 안에서
// 이걸 부르는데, 콜백이 테스트 밖에서 돌기 때문에 던진 예외를 아무도 못 받는다.
// vitest 는 "unhandled error" 로 세고 "false positive 가능" 이라고 경고한다 —
// 즉 이 자리를 비워 두면 결과를 믿을 수 없다.
//
// **Element.prototype 에 둔다. HTMLElement.prototype 이 아니다.**
// 호출을 세려는 테스트는 Element.prototype 에 스파이를 꽂는데(#477 의
// useHashTarget.test.jsx), 여기서 HTMLElement 쪽에 두면 더 가까운 프로토타입이
// 그 스파이를 가려서 호출 수가 0 으로 잡힌다. 같은 자리에 둬야 덮어쓸 수 있다.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

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
