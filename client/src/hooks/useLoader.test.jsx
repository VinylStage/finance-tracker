import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLoader } from './useLoader';

// 끝나는 시점을 테스트가 정하는 약속. 경쟁 조건을 만들려면 순서를 손으로
// 잡아야 한다.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useLoader 최초 로드', () => {
  it('성공하면 오류 없이 끝난다', async () => {
    const loadFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useLoader(loadFn, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(null);
    expect(loadFn).toHaveBeenCalledTimes(1);
  });

  it('처음부터 실패하면 오류를 드러낸다', async () => {
    const boom = new Error('끊김');
    const loadFn = vi.fn().mockRejectedValue(boom);
    const { result } = renderHook(() => useLoader(loadFn, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(boom);
  });
});

describe('useLoader 다시 읽기', () => {
  it('한 번 성공한 뒤의 실패는 화면을 덮지 않는다', async () => {
    const loadFn = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('두 번째 실패'));

    const { result } = renderHook(() => useLoader(loadFn, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(null);

    await act(async () => { await result.current.reload(); });

    // 실패했지만 오류로 덮지 않는다 — 보던 데이터를 그대로 둔다
    expect(result.current.error).toBe(null);
    expect(result.current.loading).toBe(false);
    expect(loadFn).toHaveBeenCalledTimes(2);
  });

  it('늦게 도착한 옛 실패가 새 성공을 덮지 않는다', async () => {
    const first = deferred();
    const loadFn = vi.fn()
      .mockImplementationOnce(() => first.promise)   // 첫 요청: 나중에 실패시킨다
      .mockImplementationOnce(() => Promise.resolve()); // 둘째 요청: 바로 성공

    const { result } = renderHook(() => useLoader(loadFn, []));

    // 첫 요청이 아직 안 끝난 상태에서 다시 읽는다
    await act(async () => { await result.current.reload(); });
    expect(result.current.error).toBe(null);

    // 이제서야 첫 요청이 실패한다 — 이미 지난 요청이므로 버려야 한다
    await act(async () => {
      first.reject(new Error('늦게 온 실패'));
      await first.promise.catch(() => {});
    });

    expect(result.current.error).toBe(null);
  });
});
