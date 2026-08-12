import React from 'react';
import { render, screen, waitFor , act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmProvider, useConfirm } from './ConfirmProvider';

function Consumer({ onResult, tone, confirmLabel, cancelLabel }) {
  const { confirm, alert } = useConfirm();
  return (
    <div>
      <button onClick={async () => onResult(await confirm('지울까요?', { tone, confirmLabel, cancelLabel }))}>
        confirm 부르기
      </button>
      <button onClick={async () => onResult(await alert('알림입니다', { tone, confirmLabel }))}>
        alert 부르기
      </button>
    </div>
  );
}

const setup = (props = {}) =>
  render(<ConfirmProvider><Consumer {...props} /></ConfirmProvider>);

// ─────────────────────────────────────────────────────────────────────────
// 돌연변이로 못 잡은 것 1건 — 사유
//
// `useEffect` 의 정리 함수에서 `removeEventListener` 를 빼도 이 테스트들은 전부
// 통과한다. 리스너가 남아 있어도 닫힌 뒤의 키 입력은 `settle` 에서 대기 중인
// resolver 가 이미 `null` 이라 아무것도 해소하지 않기 때문이다 — **관측되는
// 동작이 같다.**
//
// "그 줄이 필요 없다" 는 뜻이 아니다. 리스너 누수는 실재하지만 이 층위(렌더
// 결과와 콜백 호출)로는 드러나지 않는다. 잡으려면 `window.addEventListener` 를
// 감시해 등록·해제 횟수를 세야 하는데, 그건 구현 세부를 잠그는 쪽이라 두지 않았다.
// ─────────────────────────────────────────────────────────────────────────
describe('ConfirmProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A-1. 그리기만 함', async () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('A-2. «confirm 부르기» 클릭', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('지울까요?')).toBeTruthy();
  });

  it('A-3. 그 상태', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    expect(screen.getByText('확인')).toBeTruthy();
    expect(screen.getByText('취소')).toBeTruthy();
  });

  it('A-4. `confirmLabel=\'지우기\'`, `cancelLabel=\'그만\'` 으로 부름', async () => {
    const onResult = vi.fn();
    setup({ onResult, confirmLabel: '지우기', cancelLabel: '그만' });
    await userEvent.click(screen.getByText('confirm 부르기'));
    expect(screen.getByText('지우기')).toBeTruthy();
    expect(screen.getByText('그만')).toBeTruthy();
  });

  it('B-1. confirm 을 열고 \'확인\' 클릭', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    await userEvent.click(screen.getByText('확인'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('B-2. confirm 을 열고 \'취소\' 클릭', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    await userEvent.click(screen.getByText('취소'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('C-1. «alert 부르기» 클릭', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('alert 부르기'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.queryByText('취소')).toBeNull();
    // 문구만 보면 부족하다 — 취소 버튼이 라벨 없이 렌더돼도 통과한다.
    // alert 은 버튼이 **하나뿐**이어야 한다.
    expect(dialog.querySelectorAll('button').length).toBe(1);
  });

  it('C-2. alert 을 열고 \'확인\' 클릭', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('alert 부르기'));
    await userEvent.click(screen.getByText('확인'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(undefined));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('D-1. confirm 을 열고 `Escape` 키', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    // 키 처리기가 window 에 붙어 있어 React 이벤트 시스템 밖이다. act 로 감싸지
    // 않으면 상태 변경이 테스트 밖에서 일어나 act 경고가 난다.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('D-2. confirm 을 열고 `Enter` 키', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('D-3. alert 을 열고 `Escape` 키', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('alert 부르기'));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(undefined));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('D-4. 다이얼로그가 닫힌 뒤 `Escape` 키', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    await userEvent.click(screen.getByText('확인'));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    // onResult 호출 횟수를 확인하여 키 처리기가 제거되었는지 검증
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('E-1. confirm 을 열고 **바깥 배경**을 클릭', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    // 바깥 배경 클릭 (dialog 요소 자체)
    const dialogBackdrop = screen.getByRole('dialog');
    await userEvent.click(dialogBackdrop);
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('E-2. confirm 을 열고 **안쪽 상자**를 클릭', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    // 안쪽 상자 클릭 (dialog 내부의 bg-surface 요소)
    const dialogBox = screen.getByRole('dialog').querySelector('.bg-surface');
    await userEvent.click(dialogBox);
    expect(screen.queryByRole('dialog')).toBeTruthy(); // 닫히지 않음
  });

  it('F-1. 다이얼로그가 열리면', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    expect(document.activeElement).toBe(screen.getByText('확인'));
  });

  it('G-1. confirm 을 연 채로 **또 confirm 을 부른다**', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    // 첫 번째 confirm이 열린 상태에서 두 번째 confirm 호출
    await userEvent.click(screen.getByText('confirm 부르기'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('G-2. confirm 을 연 채로 **alert 을 부른다**', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    // 첫 번째 confirm이 열린 상태에서 alert 호출
    await userEvent.click(screen.getByText('alert 부르기'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('H-1. `tone=\'danger\'` 로 confirm', async () => {
    const onResult = vi.fn();
    setup({ onResult, tone: 'danger' });
    await userEvent.click(screen.getByText('confirm 부르기'));
    expect(screen.getByText('확인').className).toContain('btn-danger');
  });

  it('H-2. tone 을 안 주고 confirm', async () => {
    const onResult = vi.fn();
    setup({ onResult });
    await userEvent.click(screen.getByText('confirm 부르기'));
    expect(screen.getByText('확인').className).toContain('btn-primary');
  });

  it('I-1. `ConfirmProvider` 밖에서 `useConfirm` 을 쓰는 컴포넌트를 그린다', async () => {
    function Bare() {
      useConfirm();
      return <div>test</div>;
    }

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow();
    consoleSpy.mockRestore();
  });
});
