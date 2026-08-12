import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategorySpendSection, { SliceTooltip } from './CategorySpendSection';

const slice = (category, total, extra = {}) => ({
  payload: [{ payload: { category, total, ...extra } }],
});

describe('SliceTooltip', () => {
  it('마우스가 조각 위에 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<SliceTooltip active={false} {...slice('식비', 1000)} others={[]} />);
    expect(container.textContent).toBe('');
  });

  it('payload 가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<SliceTooltip active others={[]} />);
    expect(container.textContent).toBe('');
  });

  it('payload 가 빈 배열이면 아무것도 그리지 않는다', () => {
    const { container } = render(<SliceTooltip active payload={[]} others={[]} />);
    expect(container.textContent).toBe('');
  });

  it('보통 조각이면 이름과 금액만 말한다', () => {
    render(<SliceTooltip active {...slice('식비', 500000)} others={[{ category: '문화', total: 100 }]} />);
    expect(screen.getByText('식비')).toBeTruthy();
    expect(screen.getByText('500,000원')).toBeTruthy();
    // isOthers 가 아니므로 others 를 받았더라도 목록을 펼치지 않는다
    expect(screen.queryByText('문화')).toBe(null);
  });

  it('기타 조각이면 묶인 카테고리를 목록으로 펼친다', () => {
    render(
      <SliceTooltip
        active
        {...slice('기타', 30000, { isOthers: true })}
        others={[{ category: '문화', total: 20000 }, { category: '의료', total: 10000 }]}
      />,
    );
    expect(screen.getByText('문화')).toBeTruthy();
    expect(screen.getByText('20,000원')).toBeTruthy();
    expect(screen.getByText('의료')).toBeTruthy();
    expect(screen.getByText('10,000원')).toBeTruthy();
  });

  it('기타 조각이어도 묶인 것이 없으면 목록을 만들지 않는다', () => {
    const { container } = render(
      <SliceTooltip active {...slice('기타', 30000, { isOthers: true })} others={[]} />,
    );
    expect(container.querySelector('ul')).toBe(null);
    expect(screen.getByText('기타')).toBeTruthy();
  });
});

describe('CategorySpendSection 뷰 전환', () => {
  it('파이로 갔다가 랭킹으로 되돌아온다', async () => {
    const user = userEvent.setup();
    render(<CategorySpendSection rows={[{ category: '식비', total: 500000 }]} />);

    const rank = screen.getByRole('button', { name: '랭킹' });
    const pie = screen.getByRole('button', { name: '파이' });

    expect(rank.getAttribute('aria-pressed')).toBe('true');
    expect(pie.getAttribute('aria-pressed')).toBe('false');

    await user.click(pie);
    expect(pie.getAttribute('aria-pressed')).toBe('true');
    expect(rank.getAttribute('aria-pressed')).toBe('false');

    // 되돌아오면 랭킹 목록의 금액이 다시 보인다
    await user.click(rank);
    expect(rank.getAttribute('aria-pressed')).toBe('true');
    expect(pie.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('500,000원')).toBeTruthy();
  });
});

describe('CategorySpendSection 금액이 빈 줄', () => {
  it('금액 칸이 없는 줄이 있어도 나머지 점유율이 살아 있다', () => {
    render(
      <CategorySpendSection
        rows={[
          { category: '식비', total: 400000 },
          { category: '문화' },
        ]}
      />,
    );

    expect(screen.getByText('식비')).toBeTruthy();
    expect(screen.getByText('400,000원')).toBeTruthy();
    // 합계가 무너지면 이 줄이 0% 로 나온다
    expect(screen.getByText('100%')).toBeTruthy();

    expect(screen.getByText('문화')).toBeTruthy();
    expect(screen.getByText('0원')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('금액이 null 인 줄도 0원으로 센다', () => {
    render(
      <CategorySpendSection
        rows={[
          { category: '식비', total: 400000 },
          { category: '문화', total: null },
        ]}
      />,
    );

    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('0원')).toBeTruthy();
  });
});
