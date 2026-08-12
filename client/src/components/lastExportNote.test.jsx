import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { LastExportNote, TrustPanel } from './TrustPanel';

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

describe('데이터가 어디 있는지 알리는 안내', () => {
  it('이 기기의 파일에 있다고 말한다', () => {
    render(<TrustPanel />);
    expect(screen.getByText('내 데이터는 어디에 있나요')).toBeTruthy();
    expect(screen.getByText(/이 기기의 파일/)).toBeTruthy();
  });

  it('외부 호출이 있다는 사실도 함께 밝힌다', () => {
    render(<TrustPanel />);
    // «전송 경로가 없다» 만 쓰면 외부 호출 자체가 없다는 오해를 준다.
    // 예외를 함께 적는 것이 이 화면의 규칙이다.
    expect(screen.getByText(/외부로 전송되는 경로는 없습니다/)).toBeTruthy();
    expect(screen.getByText(/환율과 주가를 불러올 때만 외부 API/)).toBeTruthy();
  });
});
