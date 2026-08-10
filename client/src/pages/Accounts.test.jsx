import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Accounts from './Accounts';
import { api } from '../lib/api';

// ESM 모듈에서 require() 로 집으면 vi.fn 이 아닌 것이 잡힌다. import 한 것을 그대로 쓴다.
vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
}));

const ACCOUNTS = [
  {
    id: 1,
    name: '주거래통장',
    type: '입출금',
    balance: 1000000,
    available: 1000000,
    counted: 5,
    deferred: 2,
    skipped: 0,
    opening_balance: 900000,
    card_unpaid: {
      total: 50000,
      byMonth: { '2026-05': { deferred: 45000, settled: 0, unpaid: 45000 } },
      unassigned: { deferred: 5000, settled: 0, count: 1 }
    }
  },
  {
    id: 2,
    name: '저축계좌',
    type: '적금',
    balance: 2000000,
    available: 2000000,
    counted: 0,
    deferred: 0,
    skipped: 0,
    opening_balance: 1500000,
    card_unpaid: null
  }
];

function mockApiGet(accounts = ACCOUNTS, error = null) {
  api.get.mockImplementation((url) => {
    if (url.includes('/api/accounts/balances')) {
      return error ? Promise.reject(error) : Promise.resolve({ data: accounts });
    }
    return Promise.reject(new Error(`예상 못 한 요청: ${url}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Accounts page', () => {
  it('renders account list with total balance', async () => {
    mockApiGet();
    render(<Accounts />);
    
    // 로딩 상태 확인
    expect(screen.getByText('로딩 중...')).toBeTruthy();
    
    // 데이터 로드 후 화면 확인
    await waitFor(() => {
      expect(screen.getByText('통장 잔액')).toBeTruthy();
      expect(screen.getByText('총 잔액')).toBeTruthy();
      expect(screen.getByText('3,000,000원')).toBeTruthy();
      expect(screen.getByText('주거래통장')).toBeTruthy();
      expect(screen.getByText('저축계좌')).toBeTruthy();
    });
  });

  it('shows account details correctly', async () => {
    mockApiGet();
    render(<Accounts />);
    
    await waitFor(() => {
      // 첫 번째 계좌 확인
      expect(screen.getByText('주거래통장')).toBeTruthy();
      expect(screen.getByText('1,000,000원')).toBeTruthy();
      expect(screen.getByText('50,000원')).toBeTruthy();
      
      // 두 번째 계좌 확인
      expect(screen.getByText('저축계좌')).toBeTruthy();
      expect(screen.getByText('2,000,000원')).toBeTruthy();
      expect(screen.getByText('—')).toBeTruthy();
    });
  });

  it('shows unknown billing message for accounts with unassigned transactions', async () => {
    mockApiGet([
      {
        ...ACCOUNTS[0],
        card_unpaid: {
          total: 50000,
          byMonth: { '2026-05': { deferred: 45000, settled: 0, unpaid: 45000 } },
          unassigned: { deferred: 5000, settled: 0, count: 3 }
        }
      }
    ]);
    
    render(<Accounts />);
    
    await waitFor(() => {
      expect(screen.getByText('청구월을 모르는 거래 3건이 있어요.')).toBeTruthy();
    });
  });

  it('shows no activity message for accounts with no transactions', async () => {
    mockApiGet([
      {
        ...ACCOUNTS[1],
        counted: 0,
        deferred: 0
      }
    ]);
    
    render(<Accounts />);
    
    await waitFor(() => {
      expect(screen.getByText('아직 거래가 없어요.')).toBeTruthy();
    });
  });

  it('shows empty state when no accounts exist', async () => {
    mockApiGet([]);
    render(<Accounts />);
    
    await waitFor(() => {
      expect(screen.getByText('등록된 계좌가 없어요')).toBeTruthy();
      expect(screen.getByText('설정에서 계좌를 먼저 등록해 주세요.')).toBeTruthy();
    });
  });

  // 위임 산출물이 여기서 자기 모킹으로 자기 단언을 무너뜨렸다. Error('Failed to
  // load') 를 주입해 놓고 LoadError 의 **폴백** 문구를 기대했는데, LoadError 는
  // error.message 가 있으면 그것을 그대로 보여준다(폴백은 message 가 없을 때만).
  // 실제 동작을 단언하도록 고쳤다.
  it('불러오기에 실패하면 이유와 다시 시도를 보여준다', async () => {
    mockApiGet(null, new Error('잔액을 불러오지 못했어요'));
    render(<Accounts />);

    await waitFor(() => {
      expect(screen.getByText('잔액을 불러오지 못했어요')).toBeTruthy();
      expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    });
  });

  it('메시지 없는 오류에는 공용 문구가 나온다', async () => {
    mockApiGet(null, new Error());
    render(<Accounts />);

    await waitFor(() => {
      expect(screen.getByText('데이터를 불러오지 못했습니다.')).toBeTruthy();
    });
  });
});

// 위임 검수에서 나온 회귀(#291 위임 실험 2회차).
//
// 첫 산출물이 `total > 0` 으로 걸러 음수 미결제액을 '—' 로 감췄다. 음수는
// 정산이 사용 기록보다 많다는 뜻이고 데이터가 어긋났다는 신호다 —
// accountBalance.js 가 0 에서 자르지 않기로 한 것과 같은 이유다.
describe('음수 미결제액', () => {
  it('감추지 않고 그대로 보여준다', async () => {
    mockApiGet([{
      id: 1, name: '주거래통장', type: '입출금',
      balance: 1000000, available: 1000000, opening_balance: 900000,
      counted: 3, deferred: 0, skipped: 0,
      card_unpaid: { total: -40000, byMonth: {}, unassigned: { deferred: 0, settled: 0, count: 0 } },
    }]);
    render(<Accounts />);

    await waitFor(() => {
      expect(screen.getByText('-40,000원')).toBeTruthy();
    });
  });
});
