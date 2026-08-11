import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmProvider, useConfirm } from './ConfirmProvider';

// 버튼을 누르면 confirm/alert 을 부르고, 해소된 값을 화면에 적는다.
// 값이 무엇으로 해소됐는지를 글자로 봐야 Promise 결과를 검사할 수 있다.
function Consumer({ kind = 'confirm', message = '지울까요?', options, onResolved }) {
  const { confirm, alert } = useConfirm();
  const [result, setResult] = useState('아직');

  const go = async () => {
    const value = kind === 'alert'
      ? await alert(message, options)
      : await confirm(message, options);
    setResult(String(value));
    if (onResolved) onResolved(value);
  };

  return (
    <div>
      <button onClick={go}>열기</button>
      <p>결과: {result}</p>
    </div>
  );
}

const renderWith = (props) =>
  render(<ConfirmProvider><Consumer {...props} /></ConfirmProvider>);

describe('ConfirmProvider', () => {
  it('부르기 전에는 다이얼로그가 없다', async () => {
    renderWith({});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirm 을 부르면 메시지와 두 버튼이 나온다', async () => {
    const user = userEvent.setup();
    renderWith({ message: '정말 지울까요?' });
    await user.click(screen.getByRole('button', { name: '열기' }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('정말 지울까요?')).toBeTruthy();
    expect(screen.getByRole('button', { name: '확인' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy();
  });

  it('확인을 누르면 true 로 해소된다', async () => {
    const user = userEvent.setup();
    renderWith({});
    await user.click(screen.getByRole('button', { name: '열기' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(await screen.findByText('결과: true')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('취소를 누르면 false 로 해소된다', async () => {
    const user = userEvent.setup();
    renderWith({});
    await user.click(screen.getByRole('button', { name: '열기' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(await screen.findByText('결과: false')).toBeTruthy();
  });

  it('alert 은 버튼이 하나뿐이다', async () => {
    const user = userEvent.setup();
    renderWith({ kind: 'alert', message: '저장했어요' });
    await user.click(screen.getByRole('button', { name: '열기' }));

    expect(await screen.findByText('저장했어요')).toBeTruthy();

    const dialog = await screen.findByRole('dialog');
    const buttons = dialog.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('확인');
  });

  it('alert 의 확인은 undefined 로 해소된다', async () => {
    const user = userEvent.setup();
    renderWith({ kind: 'alert' });
    await user.click(screen.getByRole('button', { name: '열기' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(await screen.findByText('결과: undefined')).toBeTruthy();
  });

  it('버튼 이름을 바꿀 수 있다', async () => {
    const user = userEvent.setup();
    renderWith({ options: { confirmLabel: '지우기', cancelLabel: '그만두기' } });
    await user.click(screen.getByRole('button', { name: '열기' }));
    await screen.findByRole('dialog');

    expect(await screen.findByRole('button', { name: '지우기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '그만두기' })).toBeTruthy();
  });

  it('Escape 를 누르면 취소된다', async () => {
    const user = userEvent.setup();
    renderWith({});
    await user.click(screen.getByRole('button', { name: '열기' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    expect(await screen.findByText('결과: false')).toBeTruthy();
  });

  it('Enter 를 누르면 확인된다', async () => {
    const user = userEvent.setup();
    renderWith({});
    await user.click(screen.getByRole('button', { name: '열기' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('결과: true')).toBeTruthy();
  });

  it('Provider 밖에서 useConfirm 을 쓰면 막는다', async () => {
    function Bare() {
      useConfirm();
      return null;
    }

    // React 가 오류를 콘솔에 찍는다. 테스트 출력이 지저분해지지 않게 잠시 막는다.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/ConfirmProvider/);
    spy.mockRestore();
  });
});
