import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RetentionNotice from './RetentionNotice';

// 감사로그 보존 정책 사후 고지(#445 §1).
//
// #367 이 "자동이면 사후 고지" 로 정했는데 **알리는 화면이 없어서 정리가 조용히
// 돌고 있었다.** ADR 0008 의 "조용히 넘어가지 않는다" 가 안 지켜지던 자리다.
//
// 여기서 잠그는 것.
//   1. 지운 것이 있으면 반드시 알리는가
//   2. 지운 것이 없으면 조용한가 — "지운 것 없음" 은 알릴 일이 아니다
//   3. 정리 실패는 매번 알리는가 — 안 고쳐지면 이력이 계속 쌓인다
//   4. 고지가 실패해도 화면을 안 망가뜨리는가

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post: vi.fn(), put: vi.fn(), del: vi.fn(), raw: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

const PURGED = { deleted: 42, cutoff: '2026-02-01', days: 180, ran: true };

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(PURGED);
  try { sessionStorage.clear(); } catch { /* 저장소가 없어도 테스트는 돈다 */ }
});

describe('A. 지운 것이 있으면 알린다', () => {
  it('A-1. 며칠 지난 몇 건인지 말한다', async () => {
    render(<RetentionNotice />);
    const element = await screen.findByText(/180일 지난 변경 이력 42건/);
    expect(element).toBeTruthy();
  });

  it('A-2. 기준일을 같이 말한다', async () => {
    // 문구가 한 <p> 안에서 여러 조각으로 쪼개져 있어 정확일치로는 못 찾는다.
    // 줄 전체를 본다.
    render(<RetentionNotice />);
    const line = await screen.findByRole('status');
    expect(line.textContent).toMatch(/2026-02-01/);
  });

  it('A-3. role=status 로 낸다', async () => {
    render(<RetentionNotice />);
    const element = await screen.findByRole('status');
    expect(element).toBeTruthy();
  });
});

describe('B. 지운 것이 없으면 조용하다', () => {
  it('B-1. 0건이면 아무것도 안 띄운다', async () => {
    get.mockResolvedValue({ deleted: 0, cutoff: null, days: 180, ran: true });
    const { container } = render(<RetentionNotice />);
    await new Promise((r) => setTimeout(r, 200));
    expect(container.textContent).toBe('');
  });

  it('B-2. deleted 가 없는 응답도 안 띄운다', async () => {
    get.mockResolvedValue({ ran: true });
    const { container } = render(<RetentionNotice />);
    await new Promise((r) => setTimeout(r, 200));
    expect(container.textContent).toBe('');
  });
});

describe('C. 정리 실패는 매번 알린다', () => {
  it('C-1. 실패하면 이력이 쌓인다고 말한다', async () => {
    get.mockResolvedValue({ deleted: 0, cutoff: null, days: 0, ran: false, error: '실패' });
    render(<RetentionNotice />);
    expect(await screen.findByText(/이력이 계속 쌓입니다/)).toBeTruthy();
  });

  it('C-2. 실패 알림에는 확인 버튼이 없다', async () => {
    get.mockResolvedValue({ deleted: 0, cutoff: null, days: 0, ran: false, error: '실패' });
    render(<RetentionNotice />);
    const button = screen.queryByRole('button', { name: '확인' });
    expect(button).toBeNull();
  });

  it('C-3. 서버 문구를 그대로 노출하지 않는다', async () => {
    get.mockResolvedValue({ deleted: 0, cutoff: null, days: 0, ran: false, error: 'SQLITE_BUSY: database is locked' });
    render(<RetentionNotice />);
    const element = screen.queryByText(/SQLITE/);
    expect(element).toBeNull();
  });
});

describe('D. 고지가 화면을 망가뜨리지 않는다', () => {
  it('D-1. 조회가 실패해도 아무것도 안 띄운다', async () => {
    get.mockRejectedValue(new Error('서버 오류'));
    const { container } = render(<RetentionNotice />);
    await new Promise((r) => setTimeout(r, 200));
    expect(container.textContent).toBe('');
  });

  it('D-2. 확인을 누르면 사라진다', async () => {
    render(<RetentionNotice />);
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: '확인' });
    await user.click(button);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});
