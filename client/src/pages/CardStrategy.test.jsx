import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardStrategy from './CardStrategy';

// 더 안 쓰는 카드를 화면이 어떻게 다루는가(#410).
//
// 소프트 삭제의 목적은 과거를 보존하는 것이다. 그런데 화면에서 감춰 버리면
// "지난달 이 카드로 30만원 썼는데 목록에 없다" 가 되어 그 목적이 반쯤 사라진다.
// 그래서 **감추지 않고 흐리게** 두고, "지금 이걸 쓰라" 로 읽히지 않게 표시한다.
//
// 이 화면은 #400 으로 들어온 뒤 렌더하는 테스트가 하나도 없었다. 여기가 처음이다.

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

// 실제 api 객체(lib/api.js)의 표면을 그대로 흉내낸다. 없는 이름을 지어내면
// 화면이 그것을 불러도 테스트만 통과한다.
vi.mock('../lib/api', () => ({
  api: { get, post: vi.fn(), put: vi.fn(), del: vi.fn(), raw: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('wouter', () => ({
  Link: ({ children }) => <span>{children}</span>,
}));

const threshold = (over = {}) => ({
  cardProductId: 1,
  issuer: '하나카드',
  productName: '하나 A',
  isActive: true,
  required: 300000,
  spend: 320000,
  met: true,
  estimated: false,
  ...over,
});

const COMPARISON = {
  comparable: false,
  reason: 'single-card',
  totalGap: 0,
  byCard: [],
  details: [],
  period: { from: '2026-05-01', to: '2026-08-05' },
  thresholdEstimated: false,
};

function mockApi(thresholds) {
  get.mockImplementation((path) => {
    if (String(path).includes('/thresholds')) return Promise.resolve({ data: thresholds, asOf: '2026-08-05' });
    return Promise.resolve(COMPARISON);
  });
}

// 로딩이 걷힐 때까지 기다린다. 안 기다리면 껍데기만 보고 통과한다.
async function renderLoaded(thresholds) {
  mockApi(thresholds);
  render(<CardStrategy />);
  await waitFor(() => expect(screen.queryByText('불러오는 중')).toBeNull());
}

beforeEach(() => {
  get.mockReset();
});

describe('더 안 쓰는 카드 표시', () => {
  it('비활성 카드를 목록에서 감추지 않는다', async () => {
    await renderLoaded([threshold({ cardProductId: 2, productName: '옛날 카드', isActive: false })]);

    // 감추면 지난 실적을 볼 길이 없어진다.
    expect(screen.getByText('옛날 카드')).toBeTruthy();
  });

  it('더 안 쓰는 카드라고 표시한다', async () => {
    await renderLoaded([threshold({ cardProductId: 2, productName: '옛날 카드', isActive: false })]);

    expect(screen.getByText('더 안 쓰는 카드')).toBeTruthy();
    expect(screen.getByText(/새 거래에서 고를 수 없어요/)).toBeTruthy();
  });

  it('활성 카드에는 그 표시를 붙이지 않는다', async () => {
    await renderLoaded([threshold()]);

    expect(screen.getByText('하나 A')).toBeTruthy();
    expect(screen.queryByText('더 안 쓰는 카드')).toBeNull();
    expect(screen.queryByTestId('inactive-threshold-row')).toBeNull();
  });

  it('isActive 가 아예 없는 응답은 활성으로 본다', async () => {
    // 서버가 그 필드를 안 실어 보내던 시절의 응답이 섞여도 회색이 되면 안 된다.
    const noFlag = threshold();
    delete noFlag.isActive;
    await renderLoaded([noFlag]);

    expect(screen.queryByText('더 안 쓰는 카드')).toBeNull();
  });

  it('쓰는 카드를 위로 모은다', async () => {
    await renderLoaded([
      threshold({ cardProductId: 2, productName: '옛날 카드', isActive: false }),
      threshold({ cardProductId: 1, productName: '지금 카드', isActive: true }),
    ]);

    const rows = [...document.querySelectorAll('li')];
    const names = rows.map((li) => li.textContent);
    const activeAt = names.findIndex((t) => t.includes('지금 카드'));
    const inactiveAt = names.findIndex((t) => t.includes('옛날 카드'));

    expect(activeAt).toBeGreaterThanOrEqual(0);
    expect(inactiveAt).toBeGreaterThanOrEqual(0);
    expect(activeAt).toBeLessThan(inactiveAt);
  });

  it('비활성 행에 표식을 남긴다', async () => {
    await renderLoaded([threshold({ cardProductId: 2, productName: '옛날 카드', isActive: false })]);

    expect(screen.getByTestId('inactive-threshold-row')).toBeTruthy();
  });
});
