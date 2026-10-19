import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLoader } from './useLoader';

// #737 — loadFn 이 돌려준 반영 함수는 그 요청이 아직 최신일 때만 부른다.
// 시퀀스 가드가 loading·error 만 지키고 데이터 반영은 못 지키던 구멍을 닫는다.

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useLoader 반영 함수', () => {
  it('최신 요청이 돌려준 반영 함수는 부른다', async () => {
    const apply = vi.fn();
    const loadFn = vi.fn().mockResolvedValue(apply);
    const { result } = renderHook(() => useLoader(loadFn, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('늦게 도착한 옛 요청의 반영 함수는 부르지 않는다', async () => {
    const first = deferred();
    const applyOld = vi.fn();
    const applyNew = vi.fn();
    const loadFn = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => Promise.resolve(applyNew));
    const { result } = renderHook(() => useLoader(loadFn, []));
    await act(async () => { await result.current.reload(); });
    expect(applyNew).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve(applyOld); await first.promise; });
    expect(applyOld).not.toHaveBeenCalled();
  });

  it('deps 가 바뀌면 옛 요청의 isCurrent 는 false 가 된다', async () => {
    const seen = [];
    const loadFn = vi.fn(async (isCurrent) => { seen.push(isCurrent); });
    const { result, rerender } = renderHook(({ k }) => useLoader(loadFn, [k]), { initialProps: { k: 1 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ k: 2 });
    await waitFor(() => expect(loadFn).toHaveBeenCalledTimes(2));
    expect(seen[0]()).toBe(false);
    expect(seen[1]()).toBe(true);
  });

  it('언마운트 뒤에 끝난 요청은 반영하지 않는다', async () => {
    const first = deferred();
    const apply = vi.fn();
    const loadFn = vi.fn(() => first.promise);
    const { unmount } = renderHook(() => useLoader(loadFn, []));
    unmount();
    await act(async () => { first.resolve(apply); await first.promise; });
    expect(apply).not.toHaveBeenCalled();
  });

  it('함수가 아닌 값을 돌려주면 무시한다', async () => {
    const loadFn = vi.fn().mockResolvedValue([1, 2]);
    const { result } = renderHook(() => useLoader(loadFn, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(null);
  });

  it('반영 함수가 던지면 최초 로드 오류로 다룬다', async () => {
    const boom = new Error('반영 실패');
    const loadFn = vi.fn().mockResolvedValue(() => { throw boom; });
    const { result } = renderHook(() => useLoader(loadFn, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(boom);
  });
});
