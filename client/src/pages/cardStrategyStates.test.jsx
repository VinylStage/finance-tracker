import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardStrategy from './CardStrategy';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post: vi.fn(), put: vi.fn(), del: vi.fn(), raw: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('wouter', () => ({
  Link: ({ children }) => <span>{children}</span>,
}));

// 이름은 지어낸 것이다. 실제 보유 카드 이름을 쓰지 않는다 — 이 저장소는 공개다.
const row = (over = {}) => ({
  cardProductId: 1,
  issuer: '예시카드사',
  productName: '예시 신용카드',
  isActive: true,
  required: 300000,
  spend: 320000,
  threshold: 300000,
  met: true,
  estimated: false,
  period: { start: '2026-07-01', end: '2026-07-31' },
  tiers: [],
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

function mockApi(thresholds, { thresholdsRaw = null } = {}) {
  get.mockImplementation((path) => {
    if (String(path).includes('/thresholds')) {
      return Promise.resolve(thresholdsRaw !== null ? thresholdsRaw : { data: thresholds, asOf: '2026-08-05' });
    }
    return Promise.resolve(COMPARISON);
  });
}

// 로딩이 걷힐 때까지 기다린다. 안 기다리면 껍데기만 보고 통과한다.
async function renderLoaded(thresholds, opts) {
  mockApi(thresholds, opts);
  render(<CardStrategy />);
  await waitFor(() => expect(screen.queryByText('불러오는 중')).toBeNull());
}

beforeEach(() => { get.mockReset(); });

describe('카드가 없을 때', () => {
  it('등록하라고 안내한다', async () => {
    await renderLoaded([]);
    expect(screen.getByText(/아직 등록한 카드가 없어요/)).toBeTruthy();
  });

  it('응답에 목록 칸이 없어도 같은 안내를 낸다', async () => {
    await renderLoaded([], { thresholdsRaw: { asOf: '2026-08-05' } });
    expect(screen.getByText(/아직 등록한 카드가 없어요/)).toBeTruthy();
  });
});

describe('더 안 쓰는 카드의 자리', () => {
  it('감추지 않고 아래로 내린다', async () => {
    await renderLoaded([
      row({ cardProductId: 1, productName: '예시 안쓰는카드', isActive: false }),
      row({ cardProductId: 2, productName: '예시 쓰는카드', isActive: true }),
    ]);

    const names = screen.getAllByText(/예시 (안쓰는|쓰는)카드/).map((el) => el.textContent);
    expect(names).toEqual(['예시 쓰는카드', '예시 안쓰는카드']);
  });

  it('둘 다 쓰는 카드면 받은 순서를 지킨다', async () => {
    await renderLoaded([
      row({ cardProductId: 1, productName: '예시 첫째카드' }),
      row({ cardProductId: 2, productName: '예시 둘째카드' }),
    ]);

    const names = screen.getAllByText(/예시 (첫째|둘째)카드/).map((el) => el.textContent);
    expect(names).toEqual(['예시 첫째카드', '예시 둘째카드']);
  });
});
