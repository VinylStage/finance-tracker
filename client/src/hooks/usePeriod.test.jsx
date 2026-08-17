import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePeriod } from './usePeriod';

// 주소를 직접 갈아끼운다. 각 테스트가 자기 주소에서 시작하게 한다.
function goto(search) {
  window.history.replaceState(null, '', `/transactions${search}`);
}

beforeEach(() => {
  goto('');
  vi.restoreAllMocks();
});

afterEach(() => {
  goto('');
});

describe('usePeriod 주소에서 읽기', () => {
  it('주소에 아무것도 없으면 이번 달이다', () => {
    const { result } = renderHook(() => usePeriod());
    expect(result.current.period.preset).toBe('this-month');
    expect(result.current.period.includeDerived).toBe(true);
  });

  it('주소에 적힌 기간을 그대로 읽는다', () => {
    goto('?from=2026-03-01&to=2026-03-31');
    const { result } = renderHook(() => usePeriod());
    expect(result.current.period.from).toBe('2026-03-01');
    expect(result.current.period.to).toBe('2026-03-31');
  });

  it('파생 거래를 뺀 상태도 주소에서 읽는다', () => {
    goto('?derived=off');
    const { result } = renderHook(() => usePeriod());
    expect(result.current.period.includeDerived).toBe(false);
  });
});

describe('usePeriod 주소에 쓰기', () => {
  it('기간을 바꾸면 주소가 따라온다', () => {
    const { result } = renderHook(() => usePeriod());
    act(() => result.current.setPeriod({ from: '2026-03-01', to: '2026-03-31' }));

    expect(window.location.search).toContain('from=2026-03-01');
    expect(window.location.search).toContain('to=2026-03-31');
    expect(result.current.period.from).toBe('2026-03-01');
  });

  it('뒤로가기가 먹도록 주소를 쌓는다', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');

    const { result } = renderHook(() => usePeriod());
    act(() => result.current.setPeriod({ from: '2026-03-01', to: '2026-03-31' }));

    expect(push).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('다른 컨트롤이 실어 둔 파라미터를 날리지 않는다', () => {
    goto('?heat=amount&from=2026-01-01&to=2026-01-31');
    const { result } = renderHook(() => usePeriod());

    act(() => result.current.setPeriod({ from: '2026-03-01', to: '2026-03-31' }));

    expect(window.location.search).toContain('heat=amount');
    expect(window.location.search).toContain('from=2026-03-01');
    // 옛 기간은 남지 않는다
    expect(window.location.search).not.toContain('2026-01-01');
  });

  it('일부만 바꾸면 나머지는 지금 값을 이어받는다', () => {
    goto('?from=2026-03-01&to=2026-03-31');
    const { result } = renderHook(() => usePeriod());

    act(() => result.current.setPeriod({ includeDerived: false }));

    expect(result.current.period.from).toBe('2026-03-01');
    expect(result.current.period.to).toBe('2026-03-31');
    expect(result.current.period.includeDerived).toBe(false);
  });
});

describe('usePeriod 뒤로가기', () => {
  it('뒤로가기로 주소가 바뀌면 값도 따라온다', () => {
    goto('?from=2026-03-01&to=2026-03-31');
    const { result } = renderHook(() => usePeriod());
    expect(result.current.period.from).toBe('2026-03-01');

    // 브라우저가 주소만 바꾸고 popstate 를 던지는 상황을 그대로 만든다
    act(() => {
      window.history.replaceState(null, '', '/transactions?from=2026-05-01&to=2026-05-31');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.period.from).toBe('2026-05-01');
    expect(result.current.period.to).toBe('2026-05-31');
  });

  it('화면을 떠나면 더 듣지 않는다', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePeriod());
    unmount();

    const popCalls = remove.mock.calls.filter((c) => c[0] === 'popstate');
    expect(popCalls.length).toBeGreaterThan(0);
  });
});

describe('usePeriod 옛 기간 키를 남기지 않는다', () => {
  it('달 형태에서 날짜 범위로 바꾸면 달 표기가 사라진다', () => {
    goto('?month=2026-03&heat=amount');
    const { result } = renderHook(() => usePeriod());

    act(() => result.current.setPeriod({ from: '2026-05-01', to: '2026-05-31' }));

    expect(window.location.search).not.toContain('month=');
    expect(window.location.search).toContain('from=2026-05-01');
    // 기간과 무관한 파라미터는 그대로 남는다
    expect(window.location.search).toContain('heat=amount');
  });

  it('파생 거래를 다시 포함하면 제외 표기가 사라진다', () => {
    goto('?derived=off&from=2026-03-01&to=2026-03-31');
    const { result } = renderHook(() => usePeriod());
    expect(result.current.period.includeDerived).toBe(false);

    act(() => result.current.setPeriod({ includeDerived: true }));

    expect(window.location.search).not.toContain('derived');
    expect(result.current.period.includeDerived).toBe(true);
  });
});
