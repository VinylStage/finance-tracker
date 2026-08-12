import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ThresholdExclusionSection from './ThresholdExclusionSection';
import UndoSnackbar from './UndoSnackbar';

const { get, post, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, del },
  ApiError: class ApiError extends Error {},
}));

// 감사 이력 문구는 이 테스트의 관심이 아니다. 무엇이 오든 같은 문자열을 낸다.
vi.mock('../lib/auditFormat', () => ({
  describeAction: () => '무언가 바꿈',
}));

// 컴포넌트는 `res.data` 를 읽고 **카멜케이스** 키를 본다. 서버 응답 그대로다.
function mockExclusions() {
  get.mockResolvedValue({
    period: { start: '2026-07-01', end: '2026-07-31' },
    data: [{
      cardProductId: 1,
      productName: '테스트카드',
      issuer: '테스트카드사',
      transactions: [
        { id: 11, date: '2026-07-03', merchant: '가게', amount: 10000, excluded: 0 },
      ],
    }],
  });
  post.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
}

// 카드 목록은 **접힌 채로** 시작한다. 거래 줄의 토글을 누르려면 카드 머리글을
// 먼저 눌러 펼쳐야 한다.
async function expandAndToggle(user) {
  const header = await screen.findByRole('button', { name: /테스트카드/ });
  await user.click(header);
  await user.click(await screen.findByRole('button', { name: '실적에서 빼기' }));
}

describe('mutation gaps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ThresholdExclusionSection', () => {
    it('calls onChanged when toggling exclusion', async () => {
      const user = userEvent.setup();
      mockExclusions();
      const onChanged = vi.fn();

      render(<ThresholdExclusionSection onChanged={onChanged} />);

      await expandAndToggle(user);

      await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });

    it('reloads list when toggling exclusion', async () => {
      const user = userEvent.setup();
      mockExclusions();
      const onChanged = vi.fn();

      render(<ThresholdExclusionSection onChanged={onChanged} />);

      const header = await screen.findByRole('button', { name: /테스트카드/ });
      await user.click(header);
      const before = get.mock.calls.length;
      await user.click(await screen.findByRole('button', { name: '실적에서 빼기' }));
      await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
    });
  });

  describe('UndoSnackbar', () => {
    const CANDIDATE = { action_id: 42, table_name: 'transactions', action: 'update' };

    it('shows banner when undo candidate exists', async () => {
      get.mockResolvedValue({ undoable: CANDIDATE });

      render(<UndoSnackbar trigger={1} />);

      await waitFor(() => expect(get).toHaveBeenCalled());
      // Use queryByRole instead of findByRole to avoid the toBeInTheDocument error
      expect(screen.getByRole('button', { name: '되돌리기' })).not.toBeNull();
    });

    it('hides banner after 8 seconds', async () => {
      get.mockResolvedValue({ undoable: CANDIDATE });

      render(<UndoSnackbar trigger={1} />);

      await waitFor(() => expect(get).toHaveBeenCalled());
      // Use queryByRole instead of findByRole to avoid the toBeInTheDocument error
      expect(screen.getByRole('button', { name: '되돌리기' })).not.toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });
      // Check that element is not present in the document
      expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
    });

    it('does not show banner when no undo candidate', async () => {
      get.mockResolvedValue({});

      render(<UndoSnackbar trigger={1} />);

      await waitFor(() => expect(get).toHaveBeenCalled());
      // Check that element is not present in the document
      expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
    });

    it('does not show banner when fetch fails', async () => {
      get.mockRejectedValue(new Error('boom'));

      render(<UndoSnackbar trigger={1} />);

      await waitFor(() => expect(get).toHaveBeenCalled());
      // Check that element is not present in the document
      expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
    });
  });
});
