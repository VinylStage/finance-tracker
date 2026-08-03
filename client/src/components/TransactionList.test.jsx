import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import TransactionList from './TransactionList';

// #270: 파생 거래는 거래내역에서 고칠 수 없다. 화면이 그 상태를 **누르기 전에**
// 설명해야 한다. 수정 버튼을 눌렀다가 403 을 보면 사용자는 고장으로 읽는다.

const manual = (over = {}) => ({
  id: 1, date: '2026-03-01', category_name: '식비', major_type: '변동필수',
  merchant: '점심', amount: 12000, payment_method_name: '신한카드',
  origin: 'manual', ...over,
});

const derived = (over = {}) => ({
  id: 2, date: '2026-03-01', category_name: '할부회차금', major_type: '부채상환',
  merchant: '노트북', amount: 100000, payment_method_name: '신한카드',
  origin: 'installment', origin_ref_table: 'installments', origin_ref_id: 7,
  origin_seq: 3, origin_seq_total: 12, ...over,
});

const noop = () => {};

function renderList(items, { selectable = false, selected = new Set(), onToggleSelectAll = vi.fn() } = {}) {
  const onToggleSelect = vi.fn();
  const utils = render(
    <TransactionList
      items={items}
      onEdit={noop}
      onDelete={noop}
      selectedIds={selectable ? selected : undefined}
      onToggleSelect={selectable ? onToggleSelect : undefined}
      onToggleSelectAll={selectable ? onToggleSelectAll : undefined}
    />
  );
  return { ...utils, onToggleSelect, onToggleSelectAll };
}

const rowOf = (tx) => screen.getByText(tx.merchant).closest('tr');

describe('수정·삭제 버튼', () => {
  it('수동 거래에는 그대로 뜬다', () => {
    renderList([manual()]);
    const row = rowOf(manual());
    expect(within(row).getByText('수정')).toBeTruthy();
    expect(within(row).getByText('삭제')).toBeTruthy();
  });

  it('파생 거래에는 아예 렌더되지 않는다', () => {
    // 비활성 버튼은 누를 수 있는 것처럼 보이면서 이유도 알려주지 않는다.
    renderList([derived()]);
    const row = rowOf(derived());
    expect(within(row).queryByText('수정')).toBeNull();
    expect(within(row).queryByText('삭제')).toBeNull();
  });

  it('섞여 있어도 각자 맞게 렌더된다', () => {
    renderList([manual(), derived()]);
    expect(within(rowOf(manual())).getByText('수정')).toBeTruthy();
    expect(within(rowOf(derived())).queryByText('수정')).toBeNull();
  });
});

describe('출처 표식', () => {
  it('아이콘과 텍스트를 함께 쓴다', () => {
    // 색만으로 구분하면 색을 구분 못 하는 사용자에게 아무 정보가 없다(WCAG 1.4.1).
    const { container } = renderList([derived()]);
    const row = rowOf(derived());
    expect(within(row).getByText('할부 3/12회차')).toBeTruthy();
    expect(row.querySelector('svg')).toBeTruthy();
    expect(container).toBeTruthy();
  });

  it('고칠 수 있는 화면으로 가는 링크가 있다', () => {
    renderList([derived()]);
    const link = within(rowOf(derived())).getByText('할부 화면에서 수정');
    expect(link.closest('a').getAttribute('href')).toBe('/assets/installments#installment-7');
  });

  it('리볼빙·부채이자도 각자 표식을 단다', () => {
    renderList([
      derived({ id: 3, merchant: '리볼빙건', origin: 'revolving', origin_ref_id: 4, origin_seq: null, origin_seq_total: null }),
      derived({ id: 4, merchant: '이자건', origin: 'debt_interest', origin_ref_id: 9, origin_seq: null, origin_seq_total: null }),
    ]);
    expect(screen.getByText('리볼빙 수수료')).toBeTruthy();
    expect(screen.getByText('대출 이자')).toBeTruthy();
  });

  it('화면에 내부 필드명이 나오지 않는다', () => {
    const { container } = renderList([manual(), derived()]);
    expect(container.textContent).not.toMatch(
      /origin|installment_id|origin_ref|origin_seq|derived|manual/
    );
  });
});

describe('일괄 선택', () => {
  it('파생 거래에는 체크박스가 없다', () => {
    // 선택은 되는데 삭제만 실패하면 왜 안 됐는지 알 방법이 없다.
    renderList([manual(), derived()], { selectable: true });
    expect(within(rowOf(manual())).getByRole('checkbox')).toBeTruthy();
    expect(within(rowOf(derived())).queryByRole('checkbox')).toBeNull();
  });

  it('전체 선택이 수동 거래만 고른다', async () => {
    const user = userEvent.setup();
    const { onToggleSelectAll } = renderList([manual(), derived()], { selectable: true });
    await user.click(screen.getByLabelText('전체 선택'));
    expect(onToggleSelectAll).toHaveBeenCalledWith([1], true);
  });

  it('수동 거래가 전부 선택되면 전체 선택이 켜진다', () => {
    // 파생 거래를 셈에 넣으면 고를 수 있는 것을 다 골라도 계속 꺼져 있다.
    renderList([manual(), derived()], { selectable: true, selected: new Set([1]) });
    expect(screen.getByLabelText('전체 선택').checked).toBe(true);
  });

  it('파생 거래만 있으면 전체 선택이 켜지지 않는다', () => {
    renderList([derived()], { selectable: true, selected: new Set() });
    expect(screen.getByLabelText('전체 선택').checked).toBe(false);
  });

  it('범위 선택이 사이에 낀 파생 거래를 집어 오지 않는다', async () => {
    const user = userEvent.setup();
    const items = [
      manual({ id: 1, merchant: '첫번째' }),
      derived({ id: 2, merchant: '가운데할부' }),
      manual({ id: 3, merchant: '마지막' }),
    ];
    const { onToggleSelectAll } = renderList(items, { selectable: true });

    await user.click(within(rowOf(items[0])).getByRole('checkbox'));
    await user.keyboard('{Shift>}');
    await user.click(within(rowOf(items[2])).getByRole('checkbox'));
    await user.keyboard('{/Shift}');

    expect(onToggleSelectAll).toHaveBeenCalledWith([1, 3], true);
  });
});
