import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import EmptyState from './EmptyState';
import LoadError from './LoadError';
import CategoryBadge from './CategoryBadge';
import { LastExportNote } from './TrustPanel';

describe('EmptyState', () => {
  it('제목은 항상 나온다', () => {
    render(<EmptyState title="아직 거래가 없어요" />);
    expect(screen.getByText('아직 거래가 없어요')).toBeTruthy();
  });

  it('설명과 행동을 함께 보여준다', () => {
    render(
      <EmptyState
        title="거래 없음"
        description="첫 거래를 넣어 보세요"
        action={<button>거래 추가</button>}
      />
    );
    expect(screen.getByText('첫 거래를 넣어 보세요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '거래 추가' })).toBeTruthy();
  });

  it('필터 결과가 비었을 때는 설명과 행동을 감춘다', () => {
    render(
      <EmptyState
        title="조건에 맞는 것이 없어요"
        description="첫 거래를 넣어 보세요"
        action={<button>거래 추가</button>}
        filtered
      />
    );
    expect(screen.getByText('조건에 맞는 것이 없어요')).toBeTruthy();
    expect(screen.queryByText('첫 거래를 넣어 보세요')).toBeNull();
    expect(screen.queryByRole('button', { name: '거래 추가' })).toBeNull();
  });

  it('아이콘은 읽어 주지 않는다', () => {
    render(<EmptyState icon="📄" title="비어 있음" />);
    const iconElement = screen.getByText('📄');
    expect(iconElement.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('LoadError', () => {
  it('오류 메시지를 그대로 보여준다', () => {
    render(<LoadError error={new Error('불러오지 못했어요')} />);
    expect(screen.getByText('불러오지 못했어요')).toBeTruthy();
  });

  it('오류가 없어도 기본 문구를 보여준다', () => {
    render(<LoadError />);
    expect(screen.getByText('데이터를 불러오지 못했습니다.')).toBeTruthy();
  });

  it('onRetry 가 없으면 버튼을 안 그린다', () => {
    render(<LoadError error={new Error('그냥 오류')} />);
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });

  it('다시 시도를 누르면 onRetry 를 부른다', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<LoadError error={new Error('그냥 오류')} onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('CategoryBadge', () => {
  it('이름을 보여주고 대분류를 title 에 담는다', () => {
    render(<CategoryBadge majorType="고정지출" name="통신비" />);
    expect(screen.getByText('통신비')).toBeTruthy();
    expect(screen.getByTitle('고정지출')).toBeTruthy();
  });

  it('대분류가 없으면 미분류로 적는다', () => {
    render(<CategoryBadge name="분류안됨" />);
    expect(screen.getByTitle('미분류')).toBeTruthy();
  });
});

describe('LastExportNote', () => {
  it('내보낸 적이 없으면 그렇게 말한다', () => {
    window.localStorage.clear();
    render(<LastExportNote kind="transactions" now={Date.now()} />);
    expect(screen.getByText(/내보낸 적이 없어요/)).toBeTruthy();
  });

  it('내보낸 적이 있으면 얼마나 지났는지 보여준다', () => {
    window.localStorage.clear();
    const now = Date.parse('2026-03-10T12:00:00Z');
    const iso = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem('ft.lastExport.transactions', iso);
    render(<LastExportNote kind="transactions" now={now} />);
    expect(screen.getByText('3시간 전')).toBeTruthy();
    expect(screen.getByText(/이 브라우저 기준/)).toBeTruthy();
  });
});
