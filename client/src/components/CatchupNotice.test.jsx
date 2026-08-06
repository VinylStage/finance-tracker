import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CatchupNotice from './CatchupNotice';

// 기동 시 따라잡기(#279)가 만든 거래를 알린다(#280).
//
// catch-up 은 상한 없이 규칙대로 전부 만든다 — 공백이 길면 수십 건이 한 번에
// 생긴다. **안 알리면 사용자는 자기가 만들지 않은 거래가 목록에 나타난 것으로
// 본다.** 이 앱에서 가장 겁나는 화면이고, 그래서 이 알림이 있다.
//
// 반대로 너무 자주 뜨면 사용자가 읽지 않게 된다. 그래서 같은 기동 결과는
// 세션 안에서 한 번만 뜬다. 두 방향 다 틀리기 쉬워서 양쪽을 다 잠근다.

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post: vi.fn(), put: vi.fn(), del: vi.fn(), raw: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('알리는 경우', () => {
  it('만들어진 건수를 알린다', async () => {
    get.mockResolvedValue({ created: 3, today: '2026-08-06', details: [] });

    render(<CatchupNotice />);

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText(/3건을 자동으로 만들었어요/)).toBeTruthy();
  });
});

describe('세션 안에서 한 번만', () => {
  it('같은 기동 결과는 다시 안 뜬다', async () => {
    // 새로고침할 때마다 같은 알림이 뜨면 사용자가 읽지 않게 된다.
    window.sessionStorage.setItem('catchup-seen', '2026-08-06');
    get.mockResolvedValue({ created: 3, today: '2026-08-06', details: [] });

    render(<CatchupNotice />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('기동 날짜가 다르면 다시 뜬다', async () => {
    // 다른 날의 따라잡기는 다른 결과다. 눌러 둔 기록으로 새 결과를 가리면
    // 사용자가 모르는 사이에 거래가 또 생긴다.
    window.sessionStorage.setItem('catchup-seen', '2026-08-05');
    get.mockResolvedValue({ created: 3, today: '2026-08-06', details: [] });

    render(<CatchupNotice />);

    expect(await screen.findByRole('status')).toBeTruthy();
  });
});

describe('안 알리는 경우', () => {
  it('만들어진 게 없으면 아무것도 안 띄운다', async () => {
    // "새로 생긴 것 없음" 은 알릴 일이 아니다. 띄우면 알림이 소음이 되어 진짜 알림도 안 읽힌다
    get.mockResolvedValue({ created: 0, today: '2026-08-06', details: [] });

    render(<CatchupNotice />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('응답이 비어도 안 터진다', async () => {
    // `res.created` 를 읽기 전에 `res` 자체를 봐야 한다. 안 그러면 서버가
    // 204 나 빈 본문을 주는 순간 첫 화면이 통째로 안 뜬다.
    //
    // 두 값을 한 테스트에서 보되 **사이에 cleanup 을 넣는다.** 안 넣으면
    // 두 번째 render 가 첫 컴포넌트 위에 얹혀서, 이미 만족된 waitFor 를
    // 그대로 통과해 두 번째 단언이 아무것도 검사하지 않는다.
    for (const empty of [null, undefined]) {
      get.mockClear();
      get.mockResolvedValue(empty);

      render(<CatchupNotice />);

      await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('status')).toBeNull();
      cleanup();
    }
  });

  it('조회에 실패하면 조용히 넘어간다', async () => {
    // 알림이 안 뜨는 것은 기능 손실이 아니다. 여기서 던지면 첫 화면 전체가 안 뜬다
    get.mockRejectedValue(new Error('offline'));

    render(<CatchupNotice />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('무엇이 생겼는지 말한다', () => {
  it('규칙별 내역을 보여준다', async () => {
    // 건수만 알리면 무엇이 생겼는지 확인하러 목록을 뒤져야 한다
    get.mockResolvedValue({
      created: 3, today: '2026-08-06',
      details: [
        { rule_id: 1, merchant: '넷플릭스', created: 1 },
        { rule_id: 2, merchant: '월세', created: 2 },
      ],
    });

    render(<CatchupNotice />);

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText(/넷플릭스/)).toBeTruthy();
    expect(screen.getByText(/월세/)).toBeTruthy();
  });

  it('내역이 없어도 건수는 알린다', async () => {
    get.mockResolvedValue({ created: 5, today: '2026-08-06', details: [] });

    render(<CatchupNotice />);

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText(/5건/)).toBeTruthy();
  });
});

describe('닫기', () => {
  it('확인을 누르면 사라지고 세션에 기록한다', async () => {
    // 기록을 안 남기면 새로고침마다 같은 알림이 다시 뜬다
    get.mockResolvedValue({ created: 3, today: '2026-08-06', details: [] });

    render(<CatchupNotice />);

    expect(await screen.findByRole('status')).toBeTruthy();
    
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    
    expect(screen.queryByRole('status')).toBeNull();
    expect(window.sessionStorage.getItem('catchup-seen')).toBe('2026-08-06');
  });

  it('세션 저장이 막혀도 닫히기는 한다', async () => {
    // 저장 실패로 닫기가 막히면 사용자가 알림을 치울 수 없다
    const spy = vi.spyOn(window.sessionStorage.__proto__, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    
    get.mockResolvedValue({ created: 3, today: '2026-08-06', details: [] });

    render(<CatchupNotice />);

    expect(await screen.findByRole('status')).toBeTruthy();
    
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    
    expect(screen.queryByRole('status')).toBeNull();
    
    spy.mockRestore();
  });
});

describe('응답 전에 화면을 떠나면', () => {
  it('언마운트 뒤 도착한 응답은 뒷일을 아예 시작하지 않는다', async () => {
    // 첫 화면은 사용자가 곧바로 다른 탭으로 넘어가는 일이 잦다.
    //
    // **관측 지점을 고르는 데 주의가 필요하다.** React 18 은 언마운트된
    // 컴포넌트의 setState 를 조용히 무시하므로, 화면이나 경고를 봐서는
    // 가드가 있으나 없으나 똑같아 보인다(실제로 그 방식으로 쓴 첫 시도는
    // 가드를 지워도 통과했다).
    //
    // 갈리는 곳은 **가드 뒤에 오는 일이 시작되는가** 다. `cancelled` 가
    // true 면 sessionStorage 를 읽는 데까지 가지 않는다.
    let resolve;
    get.mockReturnValue(new Promise((r) => { resolve = r; }));
    const readSpy = vi.spyOn(window.sessionStorage.__proto__, 'getItem');

    const { unmount } = render(<CatchupNotice />);
    unmount();
    readSpy.mockClear();

    resolve({ created: 3, today: '2026-08-06', details: [] });
    await Promise.resolve();
    await Promise.resolve();

    expect(readSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    readSpy.mockRestore();
  });
});

describe('보조기술', () => {
  it('스크린리더가 방해받지 않게 polite 로 알린다', async () => {
    // assertive 면 읽던 것을 끊는다. 이건 급한 알림이 아니다
    get.mockResolvedValue({ created: 3, today: '2026-08-06', details: [] });

    render(<CatchupNotice />);

    const statusElement = await screen.findByRole('status');
    expect(statusElement.getAttribute('aria-live')).toBe('polite');
  });
});
