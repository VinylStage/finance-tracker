import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { LastExportNote } from './TrustPanel';

// 저장소 키는 종류마다 다르다. 테스트가 직접 넣고 지운다.
const KEY = (kind) => `ft.lastExport.${kind}`;

beforeEach(() => {
  window.localStorage.clear();
});

describe('아직 내보낸 적이 없을 때', () => {
  it('거래내역은 받침에 맞춰 을 을 붙인다', () => {
    render(<LastExportNote kind="transactions" now={Date.now()} />);
    expect(screen.getByText(/아직 거래내역을 내보낸 적이 없어요/)).toBeTruthy();
  });

  it('전체 데이터는 를 을 붙인다', () => {
    render(<LastExportNote kind="data" now={Date.now()} />);
    expect(screen.getByText(/아직 전체 데이터를 내보낸 적이 없어요/)).toBeTruthy();
  });

  it('모르는 종류면 그냥 데이터라고 부른다', () => {
    render(<LastExportNote kind="brand-new-kind" now={Date.now()} />);
    expect(screen.getByText(/아직 데이터를 내보낸 적이 없어요/)).toBeTruthy();
  });
});

describe('내보낸 적이 있을 때', () => {
  it('언제였는지와 이 브라우저 기준임을 함께 적는다', () => {
    const now = Date.parse('2026-08-13T09:00:00Z');
    window.localStorage.setItem(KEY('transactions'), '2026-08-13T06:00:00Z');

    render(<LastExportNote kind="transactions" now={now} />);

    expect(screen.getByText(/마지막 내보내기/)).toBeTruthy();
    expect(screen.getByText('(이 브라우저 기준)')).toBeTruthy();
  });
});
