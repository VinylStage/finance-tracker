import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UndoSnackbar from './UndoSnackbar';
import { api } from '../lib/api';

// 되돌릴 수 없는 작업에는 스낵바를 아예 띄우지 않는다 — 눌렀다가 거부되는 것보다
// 처음부터 안 보이는 편이 낫다. 그 판단은 서버가 후보를 주는지로 한다.

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const candidate = {
  action_id: 'act-1', label: '거래 추가', ts: '2026-08-04 10:00:00',
  affected: 1, tables: ['transactions'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('A. 노출 조건', () => {
  it('A-1. 되돌릴 작업이 있으면 뜬다', async () => {
    api.get.mockResolvedValue({ undoable: candidate });
    render(<UndoSnackbar trigger={1} />);
    await waitFor(() => expect(screen.getByText('거래 추가')).toBeTruthy());
  });

  it('A-2. 되돌릴 작업이 없으면 안 뜬다', async () => {
    api.get.mockResolvedValue({ undoable: null });
    const { container } = render(<UndoSnackbar trigger={1} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container.querySelector('[role="status"]')).toBe(null);
  });

  it('A-3. trigger 가 없으면 조회조차 하지 않는다', () => {
    render(<UndoSnackbar trigger={0} />);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('A-4. 조회가 실패해도 화면이 죽지 않는다', async () => {
    // 스낵바가 안 뜨는 것은 기능 손실이 아니다.
    api.get.mockRejectedValue(new Error('boom'));
    const { container } = render(<UndoSnackbar trigger={1} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container.querySelector('[role="status"]')).toBe(null);
  });

  it('A-5. 라벨이 없어도 무엇을 되돌리는지 알려준다', async () => {
    // 라벨은 선택이라 대개 비어 있다(#298). 되돌리기 버튼 옆에서 "방금 한 작업"
    // 이라고만 하면 무엇이 사라지는지 모르는 채로 누르게 된다.
    api.get.mockResolvedValue({
      undoable: { ...candidate, label: null, tables: ['installments'], ops: ['DELETE'] },
    });
    render(<UndoSnackbar trigger={1} />);
    await waitFor(() => expect(screen.getByText('할부 삭제')).toBeTruthy());
  });

  it('A-6. 여러 건이면 건수를 함께 알린다', async () => {
    // 큰 작업은 사용자가 확인하고 눌러야 한다(ADR 0008).
    api.get.mockResolvedValue({ undoable: { ...candidate, affected: 12 } });
    render(<UndoSnackbar trigger={1} />);
    await waitFor(() => expect(screen.getByText('12건')).toBeTruthy());
  });
});

describe('B. 되돌리기', () => {
  it('B-1. 버튼을 누르면 그 action_id 로 요청한다', async () => {
    api.get.mockResolvedValue({ undoable: candidate });
    api.post.mockResolvedValue({ ok: true, reverted: 1 });
    render(<UndoSnackbar trigger={1} />);
    await waitFor(() => screen.getByText('되돌리기'));

    fireEvent.click(screen.getByText('되돌리기'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/audit/undo', { action_id: 'act-1' }));
  });

  it('B-2. 성공하면 onUndone 을 부른다', async () => {
    api.get.mockResolvedValue({ undoable: candidate });
    api.post.mockResolvedValue({ ok: true, reverted: 1 });
    const onUndone = vi.fn();
    render(<UndoSnackbar trigger={1} onUndone={onUndone} />);
    await waitFor(() => screen.getByText('되돌리기'));

    fireEvent.click(screen.getByText('되돌리기'));
    await waitFor(() => expect(onUndone).toHaveBeenCalled());
  });

  it('B-3. 실패하면 사용자 말로 사유를 보여준다', async () => {
    // 그 사이 값이 또 바뀐 경우다. 조용히 사라지면 안 된다.
    api.get.mockResolvedValue({ undoable: candidate });
    api.post.mockRejectedValue(new Error('그 사이에 값이 또 바뀌어서 되돌릴 수 없어요.'));
    render(<UndoSnackbar trigger={1} />);
    await waitFor(() => screen.getByText('되돌리기'));

    fireEvent.click(screen.getByText('되돌리기'));
    await waitFor(() => expect(screen.getByText(/값이 또 바뀌어서/)).toBeTruthy());
  });
});

describe('C. 접근성', () => {
  it('C-1. 스크린리더가 읽도록 알림 역할이 붙는다', async () => {
    api.get.mockResolvedValue({ undoable: candidate });
    const { container } = render(<UndoSnackbar trigger={1} />);
    await waitFor(() => screen.getByText('되돌리기'));

    const box = container.querySelector('[role="status"]');
    expect(box.getAttribute('aria-live')).toBe('polite');
  });

  it('C-2. 되돌리기가 버튼이라 키보드로 접근된다', async () => {
    api.get.mockResolvedValue({ undoable: candidate });
    render(<UndoSnackbar trigger={1} />);
    await waitFor(() => screen.getByText('되돌리기'));

    expect(screen.getByText('되돌리기').tagName).toBe('BUTTON');
  });
});
