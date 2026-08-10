import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

// 크래시를 잡는 장치 자체가 무테스트였다(커버리지 0%).
//
// 이건 다른 컴포넌트와 성격이 다르다. 대부분의 컴포넌트는 깨지면 그 화면만
// 이상해지는데, **이게 깨지면 어떤 예외든 앱 전체가 백지가 된다.** FND-15 가
// 지적한 바로 그 상태로 돌아간다. 그리고 백지에는 아무 단서도 없어서 사용자가
// 신고할 내용조차 없다.
//
// `main.jsx` 가 루트에 물려 두었으므로 마지막 방어선이기도 하다. 이 아래에는
// 아무것도 없다.

// 렌더 중에 던지는 자식. 예외 경계는 렌더 단계의 예외만 잡는다 —
// 이벤트 핸들러 안의 예외는 안 잡히므로 그렇게 만들면 이 테스트가 무의미해진다.
function Boom() {
  throw new Error('렌더 중 터짐');
}

let errorSpy;

beforeEach(() => {
  // React 는 경계가 잡은 예외도 콘솔에 한 번 더 뱉는다. 테스트 출력이
  // 실패처럼 보이는 걸 막고, 동시에 componentDidCatch 의 로깅도 여기서 센다.
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('ErrorBoundary', () => {
  it('아무 일 없으면 자식을 그대로 보여준다', () => {
    render(
      <ErrorBoundary>
        <p>정상 화면</p>
      </ErrorBoundary>
    );

    expect(screen.getByText('정상 화면')).toBeTruthy();
  });

  it('자식이 렌더 중 던지면 백지 대신 안내를 보여준다', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    // 문구 자체보다 **무언가 사용자에게 보이는가**가 핵심이다.
    expect(screen.getByText(/화면을 표시할 수 없습니다/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy();
  });

  it('안내에 내부 오류 문구가 새지 않는다', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    // 스택이나 예외 메시지를 그대로 뿌리면 사용자는 읽을 수 없고,
    // 파일 경로 같은 것이 화면에 남는다.
    expect(screen.queryByText(/렌더 중 터짐/)).toBeNull();
    expect(screen.queryByText(/Error:/)).toBeNull();
  });

  it('다시 시도할 길을 준다 — 새로고침 버튼이 실제로 reload 를 부른다', () => {
    // 안내만 있고 빠져나갈 길이 없으면 사용자는 탭을 닫는다.
    const reload = vi.fn();
    const original = window.location;
    delete window.location;
    window.location = { ...original, reload };

    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
      fireEvent.click(screen.getByRole('button', { name: '새로고침' }));

      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      window.location = original;
    }
  });

  it('잡은 예외를 콘솔에 남긴다 — 안 남기면 진단할 근거가 없다', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    // 화면에서 숨긴 것을 콘솔에는 남겨야 한다. 둘 다 숨기면 아무도 원인을 못 찾는다.
    const tagged = errorSpy.mock.calls.filter((args) => args[0] === '[ErrorBoundary]');
    expect(tagged.length).toBeGreaterThan(0);
    expect(String(tagged[0][1])).toMatch(/렌더 중 터짐/);
  });
});
