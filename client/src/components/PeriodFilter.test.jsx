import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import PeriodFilter from './PeriodFilter';
import { usePeriod } from '../hooks/usePeriod';
import { rangeForPreset } from '../lib/periodFilter';

// 기간 필터의 화면 쪽(#272).
//
// 순수 변환(프리셋 → from/to, 경계)은 lib/periodFilter.test.jsx 가 본다.
// **여기서 고정하는 것은 URL 왕복이다** — 새로고침·뒤로가기·직접 URL 입력이
// 전부 동작하는지가 이 이슈의 핵심 인수 기준이다.

// 오늘에 의존하면 8월 31일에만 깨지는 테스트가 된다. 실제 오늘로 계산한
// 프리셋 값을 기대값으로 쓴다.
const THIS_MONTH = rangeForPreset('this-month');
const LAST_MONTH = rangeForPreset('last-month');

function Harness() {
  const { period, setPeriod } = usePeriod();
  return (
    <div>
      <PeriodFilter period={period} onChange={setPeriod} />
      <output data-testid="range">{`${period.from}~${period.to}`}</output>
      <output data-testid="derived">{String(period.includeDerived)}</output>
    </div>
  );
}

function setUrl(search) {
  window.history.replaceState(null, '', `/${search}`);
}

beforeEach(() => setUrl(''));
afterEach(() => setUrl(''));

describe('A. URL 을 읽는다', () => {
  it('A-1. 파라미터가 없으면 이번 달이다', () => {
    render(<Harness />);
    expect(screen.getByTestId('range').textContent).toBe(`${THIS_MONTH.from}~${THIS_MONTH.to}`);
    expect(screen.getByRole('button', { name: '이번 달' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('A-2. 주소로 직접 들어온 기간을 그대로 쓴다', () => {
    setUrl('?from=2026-03-05&to=2026-04-10');
    render(<Harness />);

    expect(screen.getByTestId('range').textContent).toBe('2026-03-05~2026-04-10');
    expect(screen.getByRole('button', { name: '직접 지정' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('A-3. 프리셋과 같은 기간이면 그 버튼이 눌려 보인다', () => {
    setUrl(`?from=${LAST_MONTH.from}&to=${LAST_MONTH.to}`);
    render(<Harness />);

    expect(screen.getByRole('button', { name: '지난 달' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('A-4. month 단축형을 편다', () => {
    setUrl('?month=2026-02');
    render(<Harness />);
    expect(screen.getByTestId('range').textContent).toBe('2026-02-01~2026-02-28');
  });

  it('A-5. 주소를 손으로 고쳐 망가뜨려도 화면이 안 죽는다', () => {
    setUrl('?from=2026-12-01&to=2026-01-01');
    render(<Harness />);

    // 기본값으로 떨어지되 이유를 말한다. 조용히 다른 기간을 보여주면 안 된다.
    expect(screen.getByTestId('range').textContent).toBe(`${THIS_MONTH.from}~${THIS_MONTH.to}`);
    expect(screen.getByText(/시작일이 종료일보다 뒤/)).toBeTruthy();
  });
});

describe('B. URL 에 쓴다', () => {
  it('B-1. 프리셋을 누르면 계산된 from/to 가 주소에 실린다', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '지난 달' }));

    // ?preset=last-month 를 실으면 어제 북마크한 링크가 오늘 다른 기간을 가리킨다.
    expect(window.location.search).toBe(`?from=${LAST_MONTH.from}&to=${LAST_MONTH.to}`);
    expect(window.location.search).not.toContain('preset');
    expect(screen.getByTestId('range').textContent).toBe(`${LAST_MONTH.from}~${LAST_MONTH.to}`);
  });

  it('B-2. 기본 기간으로 돌아오면 주소가 깨끗해진다', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '지난 달' }));
    await userEvent.click(screen.getByRole('button', { name: '이번 달' }));

    expect(window.location.search).toBe('');
  });

  it('B-3. 다른 컨트롤이 실어 둔 파라미터를 안 날린다', async () => {
    // 기간을 바꿨는데 아래쪽 히트맵이 초기화되면 안 된다.
    setUrl('?heatMode=year&heatYear=2025');
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '지난 달' }));

    expect(window.location.search).toContain('heatMode=year');
    expect(window.location.search).toContain('heatYear=2025');
    expect(window.location.search).toContain(`from=${LAST_MONTH.from}`);
  });

  it('B-4. 파생 거래 토글이 주소에 남는다', async () => {
    render(<Harness />);
    expect(screen.getByTestId('derived').textContent).toBe('true');

    await userEvent.click(screen.getByRole('checkbox'));

    expect(window.location.search).toContain('derived=off');
    expect(screen.getByTestId('derived').textContent).toBe('false');
  });

  it('B-5. 기본값인 포함 상태는 주소에 안 싣는다', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('checkbox'));

    expect(window.location.search).toBe('');
  });
});

describe('C. 뒤로가기', () => {
  it('C-1. 뒤로 가면 이전 기간으로 돌아온다', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '지난 달' }));
    expect(screen.getByTestId('range').textContent).toBe(`${LAST_MONTH.from}~${LAST_MONTH.to}`);

    // pushState 만 하고 popstate 를 안 들으면 주소는 바뀌는데 숫자가 안 바뀐다.
    await act(async () => { window.history.back(); });

    // jsdom 의 history 이동과 popstate 발화는 비동기다.
    await waitFor(() => {
      expect(screen.getByTestId('range').textContent).toBe(`${THIS_MONTH.from}~${THIS_MONTH.to}`);
    });
  });
});

describe('D. 직접 지정', () => {
  it('D-1. 직접 지정을 고르면 날짜 입력이 나온다', async () => {
    setUrl('?from=2026-03-05&to=2026-04-10');
    render(<Harness />);

    expect(screen.getByLabelText('시작일').value).toBe('2026-03-05');
    expect(screen.getByLabelText('종료일').value).toBe('2026-04-10');
  });

  it('D-2. 프리셋일 때는 날짜 입력을 안 보여준다', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('시작일')).toBeNull();
  });

  it('D-3. 뒤집힌 기간은 반영하지 않는다', async () => {
    setUrl('?from=2026-03-05&to=2026-04-10');
    render(<Harness />);

    // date 입력은 userEvent.type 이 안 먹는다. 변경 이벤트를 직접 준다.
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-05-01' } });

    // 시작일만 바뀐 중간 상태로 조회가 나가면 안 된다.
    expect(screen.getByTestId('range').textContent).toBe('2026-03-05~2026-04-10');
  });
});

describe('E. 월 선택 (#484)', () => {
  it('E-1. 한 달짜리 기간으로 들어오면 월 선택이 눌린 상태다', () => {
    // `?month=` 파싱은 예전부터 있었지만(#272 설계) 그 상태를 나타내는 버튼이
    // 없어서, 3월을 보고 있어도 '직접 지정' 이 눌린 것처럼 보였다.
    setUrl('?month=2026-03');
    render(<Harness />);

    expect(screen.getByTestId('range').textContent).toBe('2026-03-01~2026-03-31');
    expect(screen.getByRole('button', { name: '월 선택' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('조회할 달').value).toBe('2026-03');
  });

  it('E-2. from/to 로 들어와도 정확히 한 달이면 월 선택으로 본다', () => {
    setUrl('?from=2026-02-01&to=2026-02-28');
    render(<Harness />);

    // 2월 말일(28/29)을 사용자가 기억하지 않아도 되게 하는 게 이 기능의 요점이다.
    expect(screen.getByRole('button', { name: '월 선택' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('조회할 달').value).toBe('2026-02');
  });

  it('E-3. 하루라도 모자라면 월 선택이 아니다', () => {
    setUrl('?from=2026-02-01&to=2026-02-27');
    render(<Harness />);

    expect(screen.getByRole('button', { name: '월 선택' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByLabelText('조회할 달')).toBeNull();
  });

  it('E-4. 이번 달은 자기 버튼을 유지한다', () => {
    // 이번 달도 "정확히 한 달" 이라, 되짚는 순서를 잘못 두면 '월 선택' 이
    // 눌린 것으로 보인다.
    render(<Harness />);

    expect(screen.getByRole('button', { name: '이번 달' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '월 선택' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('E-5. 지난 달도 자기 버튼을 유지한다', () => {
    setUrl(`?from=${LAST_MONTH.from}&to=${LAST_MONTH.to}`);
    render(<Harness />);

    expect(screen.getByRole('button', { name: '지난 달' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '월 선택' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('E-6. 달을 고르면 그 달 전체가 되고 주소에 실린다', () => {
    setUrl('?month=2026-03');
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('조회할 달'), { target: { value: '2026-02' } });

    // 말일을 화면이 계산한다. 사용자가 28 을 넣을 일이 없다.
    expect(screen.getByTestId('range').textContent).toBe('2026-02-01~2026-02-28');
    expect(window.location.search).toContain('2026-02');
  });

  it('E-7. 입력을 비우는 중간 상태에서는 아무것도 하지 않는다', () => {
    setUrl('?month=2026-03');
    render(<Harness />);
    const historyBefore = window.history.length;

    fireEvent.change(screen.getByLabelText('조회할 달'), { target: { value: '' } });

    // 비운 순간 기간이 무너지면 화면이 한 번 빈다.
    expect(screen.getByTestId('range').textContent).toBe('2026-03-01~2026-03-31');

    // **기간이 그대로인 것만으로는 부족하다.** `usePeriod` 는 pushState 를 쓰므로
    // 같은 값으로라도 onChange 를 부르면 뒤로가기 기록이 하나 쌓인다. 그러면
    // 사용자가 뒤로가기를 눌러도 화면이 안 바뀌어 "먹통" 으로 보인다.
    expect(window.history.length).toBe(historyBefore);
  });

  it('E-8. 다른 프리셋에서 월 선택으로 넘어가면 보던 달이 잡힌다', () => {
    // 최근 3개월(예: 6~8월)에서 넘어가면 시작월이 잡혀야 한다. 오늘 달로 튀면
    // 사용자가 보던 곳을 잃는다.
    setUrl('?from=2026-06-01&to=2026-08-31');
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: '월 선택' }));

    expect(screen.getByTestId('range').textContent).toBe('2026-06-01~2026-06-30');
    expect(screen.getByLabelText('조회할 달').value).toBe('2026-06');
  });

  it('E-9. 프리셋일 때는 월 입력을 안 보여준다', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('조회할 달')).toBeNull();
  });
});
