import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import CardBenefitCapsFields from './CardBenefitCapsFields';

function setup(props = {}) {
  const onRowsChange = vi.fn();
  const onDatesChange = vi.fn();
  render(
    <CardBenefitCapsFields
      rows={props.rows || []}
      onRowsChange={onRowsChange}
      dates={props.dates || ''}
      onDatesChange={onDatesChange}
      inp="test-input"
    />,
  );
  return { onRowsChange, onDatesChange };
}

const ROW = { window: 'month', amount: '5000', count: '' };

describe('CardBenefitCapsFields', () => {
  it('줄이 없으면 한도 칸이 안 그려진다', () => {
    setup();
    expect(screen.queryByLabelText('한도 1 기간')).toBeNull();
    expect(screen.getByLabelText('특정 날짜에만 (선택)')).toBeTruthy();
  });

  it('줄을 받으면 값을 그대로 보여준다', () => {
    setup({ rows: [ROW] });
    expect(screen.getByLabelText('한도 1 기간').value).toBe('month');
    expect(screen.getByLabelText('한도 1 금액').value).toBe('5000');
    expect(screen.getByLabelText('한도 1 횟수').value).toBe('');
  });

  it('줄이 둘이면 번호가 1·2 로 붙는다', () => {
    setup({ rows: [ROW, { window: 'day', amount: '', count: '1' }] });
    expect(screen.getByLabelText('한도 2 횟수').value).toBe('1');
  });

  it('금액을 고치면 그 줄만 바뀐 새 배열이 올라간다', async () => {
    const { onRowsChange } = setup({ rows: [ROW] });
    await userEvent.type(screen.getByLabelText('한도 1 금액'), '1');
    expect(onRowsChange).toHaveBeenCalledWith([{ window: 'month', amount: '50001', count: '' }]);
  });

  it('기간을 고르면 그 값으로 올라간다', async () => {
    const { onRowsChange } = setup({ rows: [{ window: '', amount: '', count: '' }] });
    await userEvent.selectOptions(screen.getByLabelText('한도 1 기간'), 'day');
    expect(onRowsChange).toHaveBeenCalledWith([{ window: 'day', amount: '', count: '' }]);
  });

  it('한도 추가를 누르면 빈 줄이 하나 붙는다', async () => {
    const { onRowsChange } = setup({ rows: [ROW] });
    await userEvent.click(screen.getByRole('button', { name: '+ 한도 추가' }));
    expect(onRowsChange).toHaveBeenCalledWith([ROW, { window: '', amount: '', count: '' }]);
  });

  it('줄 삭제는 그 줄만 뺀다', async () => {
    const { onRowsChange } = setup({ rows: [ROW, { window: 'day', amount: '', count: '1' }] });
    const buttons = screen.getAllByRole('button', { name: '줄 삭제' });
    await userEvent.click(buttons[1]);
    expect(onRowsChange).toHaveBeenCalledWith([ROW]);
  });

  it('날짜 칸에 입력하면 문자열이 그대로 올라간다', async () => {
    const { onDatesChange } = setup({ dates: '10-01' });
    await userEvent.type(screen.getByLabelText('특정 날짜에만 (선택)'), ',');
    expect(onDatesChange).toHaveBeenCalledWith('10-01,');
  });
});
