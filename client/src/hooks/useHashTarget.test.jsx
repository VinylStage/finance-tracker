import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHashTarget } from './useHashTarget';

// "부채관리에서 수정" 으로 넘어왔을 때 그 항목을 찾아주는 훅(#270).
//
// 앵커(`#installment-3`)만으로는 SPA 안에서 아무 일도 안 일어난다. 브라우저의
// 해시 스크롤은 첫 로드에 한 번 도는데 그때 목록은 아직 비어 있다. 그래서
// 데이터가 들어온 뒤 직접 찾아 옮긴다.
//
// **틀렸을 때 조용하다.** 사용자는 "수정" 을 눌렀는데 목록 맨 위에 떨어지고,
// 왜 그런지 알 수 없다. 예외도 안 나고 콘솔도 조용하다. 그래서 여기서 잠근다.
//
// `Installments.jsx` 와 `Revolving.jsx` 가 각각 prefix 를 달리해 쓴다.

let rafSpy;
let scrollIntoView;

beforeEach(() => {
  window.location.hash = '';
  // rAF 를 즉시 실행으로 바꾼다. 진짜 프레임을 기다리면 테스트가 붙잡힌다.
  rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  document.body.innerHTML = '';
});

afterEach(() => {
  rafSpy.mockRestore();
  window.location.hash = '';
});

function anchor(id) {
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  return el;
}

describe('찾아가는 경우', () => {
  it('해시가 가리키는 항목을 펼치고 화면 가운데로 옮긴다', () => {
    anchor('installment-3');
    window.location.hash = '#installment-3';
    const onFound = vi.fn();

    renderHook(() => useHashTarget('installment', true, onFound));

    // 펼치는 것과 옮기는 것은 **둘 다** 필요하다. 옮기기만 하면 목록이 길 때
    // 어느 줄인지 모르고, 펼치기만 하면 화면 밖에 있어 안 보인다.
    expect(onFound).toHaveBeenCalledWith(3);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });
});

describe('안 움직여야 하는 경우', () => {
  it('아직 데이터가 안 왔으면 아무것도 안 한다', () => {
    anchor('installment-3');
    window.location.hash = '#installment-3';
    const onFound = vi.fn();

    renderHook(() => useHashTarget('installment', false, onFound));

    // ready 를 안 보면 목록이 비었을 때 스크롤해 아무 데도 못 간다.
    expect(onFound).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('다른 화면의 해시는 건드리지 않는다', () => {
    // 거래내역과 리볼빙이 같은 훅을 prefix 만 달리해 쓴다. prefix 를 안 보면
    // 리볼빙 앵커로 들어왔는데 할부 목록이 펼쳐진다.
    anchor('revolving-3');
    window.location.hash = '#revolving-3';
    const onFound = vi.fn();

    renderHook(() => useHashTarget('installment', true, onFound));

    expect(onFound).not.toHaveBeenCalled();
  });

  it('해시가 아예 없으면 아무것도 안 한다', () => {
    const onFound = vi.fn();

    renderHook(() => useHashTarget('installment', true, onFound));

    // 해시가 없으면 아무것도 안 한다.
    expect(onFound).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('id 가 숫자가 아니면 안 움직인다', () => {
    window.location.hash = '#installment-abc';
    const onFound = vi.fn();

    renderHook(() => useHashTarget('installment', true, onFound));

    // Number('abc') 는 NaN 이라 그대로 두면 setOpenId(NaN) 이 되고 아무 항목도 안 펼쳐진 채 화면만 튄다
    expect(onFound).not.toHaveBeenCalled();
  });

  it('id 가 0 이하면 안 움직인다', () => {
    window.location.hash = '#installment-0';
    const onFound = vi.fn();

    renderHook(() => useHashTarget('installment', true, onFound));

    // id 는 항상 양수다. 0 을 통과시키면 없는 항목을 펼치려다 조용히 아무 일도 안 일어난다
    expect(onFound).not.toHaveBeenCalled();
  });

  it('id 가 음수면 안 움직인다', () => {
    window.location.hash = '#installment--5';
    const onFound = vi.fn();

    renderHook(() => useHashTarget('installment', true, onFound));

    // id 는 항상 양수다. 0 을 통과시키면 없는 항목을 펼치려다 조용히 아무 일도 안 일어난다
    expect(onFound).not.toHaveBeenCalled();
  });

  it('prefix 는 같지만 형식이 다르면 안 움직인다', () => {
    window.location.hash = '#installment';
    const onFound = vi.fn();

    renderHook(() => useHashTarget('installment', true, onFound));

    // prefix 가 같아도 하이픈 뒤의 형식이 다르면 안 움직인다
    expect(onFound).not.toHaveBeenCalled();
  });

  it('prefix 가 더 긴 이름의 앵커에는 안 걸린다', () => {
    window.location.hash = '#installments-3';
    const onFound = vi.fn();

    renderHook(() => useHashTarget('installment', true, onFound));

    // `startsWith` 로만 보면 'installments-3' 이 'installment-' 로 시작하지 않아
    // 걸러진다. 이 검사가 그 사실을 고정한다 — prefix 가 늘어날 때 깨지기 쉽다.
    expect(onFound).not.toHaveBeenCalled();
  });
});

describe('가장자리', () => {
  it('앵커 요소가 없어도 터지지 않는다', () => {
    window.location.hash = '#installment-3';
    const onFound = vi.fn();

    renderHook(() => useHashTarget('installment', true, onFound));

    // 목록에서 그 항목이 이미 지워진 경우다. 여기서 터지면 화면 전체가 안 뜬다
    expect(onFound).toHaveBeenCalledWith(3);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('ready 가 false → true 로 바뀔 때 돈다', () => {
    anchor('installment-3');
    window.location.hash = '#installment-3';
    const onFound = vi.fn();
    const { rerender } = renderHook(
      ({ ready }) => useHashTarget('installment', ready, onFound),
      { initialProps: { ready: false } }
    );
    expect(onFound).not.toHaveBeenCalled();

    rerender({ ready: true });
    expect(onFound).toHaveBeenCalledWith(3);

    rerender({ ready: true });
    expect(onFound).toHaveBeenCalledTimes(1);
  });
});
