import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuditLog from './AuditLog';
import { api } from '../lib/api';

// ESM 모듈에서 require() 로 집으면 vi.fn 이 아닌 것이 잡힌다. import 한 것을 그대로 쓴다.
vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const CATEGORIES = [{ id: 11, name: '식비' }, { id: 8, name: '교통비' }];
const METHODS = [{ id: 10, name: '신한카드' }];

function row(over = {}) {
  return {
    id: 1,
    action_id: 'act-1',
    table_name: 'transactions',
    op: 'UPDATE',
    actor: 'user',
    ts: '2026-08-04 10:00:00',
    action_label: '거래 수정',
    before_json: '{"amount":1000,"category_id":11}',
    after_json: '{"amount":9000,"category_id":8}',
    undone_at: null,
    ...over,
  };
}

// 세 조회를 url 로 분기한다. 매 테스트가 같은 설정을 반복하지 않게 한 곳에 둔다.
function mockApiGet({ rows = [row()], total = rows.length, logError = null } = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes('/api/audit/log')) {
      return logError ? Promise.reject(logError) : Promise.resolve({ data: rows, total });
    }
    if (url.includes('/api/categories')) return Promise.resolve({ data: CATEGORIES });
    if (url.includes('/api/payment-methods')) return Promise.resolve({ data: METHODS });
    return Promise.reject(new Error(`예상 못 한 요청: ${url}`));
  });
}

// 로그 조회에 실제로 쓰인 URL 만 본다.
function logUrls() {
  return api.get.mock.calls.map((c) => c[0]).filter((u) => u.includes('/api/audit/log'));
}

async function openFirstRow() {
  const btn = await screen.findByRole('button', { name: /거래 수정/ });
  fireEvent.click(btn);
  return btn;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('A. 목록', () => {
  it('A-1. 기본 필터가 user 라서 첫 조회에 actor=user 가 들어간다', async () => {
    // 조회마다 도는 시스템 스윕(#205)이 목록을 뒤덮으면 자기 작업을 못 찾는다.
    mockApiGet();
    render(<AuditLog />);
    await waitFor(() => expect(logUrls()[0]).toContain('actor=user'));
  });

  it('A-2. 행의 action_label 이 화면에 보인다', async () => {
    mockApiGet();
    render(<AuditLog />);
    expect(await screen.findByText('거래 수정')).toBeTruthy();
  });

  it('A-3. 라벨이 없으면 표와 조작으로 이름을 지어낸다', async () => {
    // 라벨은 선택이라 대개 비어 있다(#298). 그때 빈칸이 보이면 안 된다.
    mockApiGet({ rows: [row({ action_label: null, table_name: 'installments', op: 'DELETE' })] });
    render(<AuditLog />);
    expect(await screen.findByText(/할부 삭제/)).toBeTruthy();
  });

  it('A-4. 결과가 비면 빈 상태 문구가 보인다', async () => {
    mockApiGet({ rows: [], total: 0 });
    render(<AuditLog />);
    expect(await screen.findByText('아직 기록이 없어요')).toBeTruthy();
  });

  it('A-5. 조회가 실패하면 재시도 수단이 보인다', async () => {
    mockApiGet({ logError: new Error('불러오지 못했어요') });
    render(<AuditLog />);
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeTruthy();
  });
});

describe('B. 필터', () => {
  it('B-1. 자동 처리를 누르면 actor=system 으로 다시 조회한다', async () => {
    mockApiGet();
    render(<AuditLog />);
    await screen.findByText('거래 수정');

    fireEvent.click(screen.getByRole('button', { name: '자동 처리' }));
    await waitFor(() => expect(logUrls().some((u) => u.includes('actor=system'))).toBe(true));
  });

  it('B-2. 필터를 바꾸면 첫 페이지로 돌아간다', async () => {
    // 3페이지를 보다 필터를 바꾸면 결과가 적어 빈 화면이 뜬다.
    mockApiGet({ rows: [row()], total: 300 });
    render(<AuditLog />);
    await screen.findByText('거래 수정');

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(logUrls().some((u) => u.includes('offset=50'))).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    await waitFor(() => {
      const last = logUrls()[logUrls().length - 1];
      expect(last).toContain('offset=0');
    });
  });

  it('B-3. 선택된 필터에 aria-pressed 가 붙는다', async () => {
    mockApiGet();
    render(<AuditLog />);
    await screen.findByText('거래 수정');

    expect(screen.getByRole('button', { name: '내 작업' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('C. 변경 내용 펼치기', () => {
  it('C-1. 행을 누르면 바뀐 필드가 보인다', async () => {
    mockApiGet();
    render(<AuditLog />);
    await openFirstRow();

    expect(await screen.findByText('금액')).toBeTruthy();
    expect(screen.getByText('9000')).toBeTruthy();
  });

  it('C-2. category_id 는 숫자가 아니라 이름으로 보인다', async () => {
    // 사용자는 id 를 모른다. `카테고리: 11 → 8` 은 아무 의미가 없다.
    mockApiGet();
    render(<AuditLog />);
    await openFirstRow();

    expect(await screen.findByText('식비')).toBeTruthy();
    expect(screen.getByText('교통비')).toBeTruthy();
  });

  it('C-3. 안 바뀐 필드는 안 보인다', async () => {
    // 안 바뀐 것까지 늘어놓으면 무엇이 바뀌었는지 오히려 안 보인다.
    mockApiGet({
      rows: [row({
        before_json: '{"amount":1000,"merchant":"그대로"}',
        after_json: '{"amount":9000,"merchant":"그대로"}',
      })],
    });
    render(<AuditLog />);
    await openFirstRow();

    expect(await screen.findByText('금액')).toBeTruthy();
    expect(screen.queryByText('가맹점')).toBe(null);
  });

  it('C-4. 다시 누르면 접힌다', async () => {
    mockApiGet();
    render(<AuditLog />);
    const btn = await openFirstRow();
    await screen.findByText('금액');

    fireEvent.click(btn);
    await waitFor(() => expect(screen.queryByText('금액')).toBe(null));
  });

  it('C-5. aria-expanded 가 펼침 상태를 따라간다', async () => {
    mockApiGet();
    render(<AuditLog />);
    const btn = await screen.findByRole('button', { name: /거래 수정/ });
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute('aria-expanded')).toBe('true'));
  });
});

describe('D. 되돌리기 버튼', () => {
  it('D-1. 내 작업이고 아직 안 되돌렸으면 버튼이 있다', async () => {
    mockApiGet();
    render(<AuditLog />);
    await openFirstRow();

    expect(await screen.findByRole('button', { name: '이 작업 되돌리기' })).toBeTruthy();
  });

  it('D-2. 시스템 작업에는 버튼을 내지 않는다', async () => {
    // 눌렀다가 거부되는 것보다 처음부터 안 보이는 편이 낫다.
    mockApiGet({ rows: [row({ actor: 'system' })] });
    render(<AuditLog />);
    fireEvent.click(await screen.findByRole('button', { name: /거래 수정/ }));

    await screen.findByText('금액');
    expect(screen.queryByRole('button', { name: '이 작업 되돌리기' })).toBe(null);
  });

  it('D-3. 이미 되돌린 작업에는 버튼을 내지 않는다', async () => {
    mockApiGet({ rows: [row({ undone_at: '2026-08-04 10:05:00' })] });
    render(<AuditLog />);
    fireEvent.click(await screen.findByRole('button', { name: /거래 수정/ }));

    await screen.findByText('금액');
    expect(screen.queryByRole('button', { name: '이 작업 되돌리기' })).toBe(null);
  });

  it('D-4. 누르면 그 행의 action_id 로 요청한다', async () => {
    mockApiGet({ rows: [row({ action_id: 'act-특정' })] });
    api.post.mockResolvedValue({ ok: true, reverted: 1 });
    render(<AuditLog />);
    await openFirstRow();

    fireEvent.click(await screen.findByRole('button', { name: '이 작업 되돌리기' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/audit/undo', { action_id: 'act-특정' }));
  });

  it('D-5. 성공하면 목록을 다시 읽는다', async () => {
    mockApiGet();
    api.post.mockResolvedValue({ ok: true, reverted: 1 });
    render(<AuditLog />);
    await openFirstRow();
    const before = logUrls().length;

    fireEvent.click(await screen.findByRole('button', { name: '이 작업 되돌리기' }));
    await waitFor(() => expect(logUrls().length).toBeGreaterThan(before));
  });

  it('D-6. 실패하면 사유를 알린다', async () => {
    // 조용히 아무 일도 안 일어난 것처럼 보이면 안 된다.
    mockApiGet();
    api.post.mockRejectedValue(new Error('그 사이에 값이 또 바뀌었어요.'));
    render(<AuditLog />);
    await openFirstRow();

    fireEvent.click(await screen.findByRole('button', { name: '이 작업 되돌리기' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/값이 또 바뀌었어요/)).toBeTruthy();
  });
});

describe('E. 페이지 나눔', () => {
  it('E-1. 한 페이지에 다 들어가면 페이지 버튼이 없다', async () => {
    mockApiGet({ rows: [row()], total: 50 });
    render(<AuditLog />);
    await screen.findByText('거래 수정');

    expect(screen.queryByRole('button', { name: '다음' })).toBe(null);
  });

  it('E-2. 넘치면 다음 페이지로 갈 수 있다', async () => {
    // 불러오기 한 번이 수백 행을 만든다.
    mockApiGet({ rows: [row()], total: 120 });
    render(<AuditLog />);
    await screen.findByText('거래 수정');

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(logUrls().some((u) => u.includes('offset=50'))).toBe(true));
  });

  it('E-3. 첫 페이지에서 이전은 눌리지 않는다', async () => {
    mockApiGet({ rows: [row()], total: 120 });
    render(<AuditLog />);
    await screen.findByText('거래 수정');

    expect(screen.getByRole('button', { name: '이전' }).disabled).toBe(true);
  });

  it('E-4. 마지막 페이지에서 다음은 눌리지 않는다', async () => {
    mockApiGet({ rows: [row()], total: 60 });
    render(<AuditLog />);
    await screen.findByText('거래 수정');

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' }).disabled).toBe(true));
  });
});
