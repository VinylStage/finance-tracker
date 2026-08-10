import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 설정 화면의 '데이터 내보내기'·'변경 이력' 절과, 세 절에 공통으로 붙는
// 마지막 내보내기 표시(#198).
//
// 절 단위로 파일을 나눈다(#480 이후 같은 방식).
//
// 이 절들은 화면 이동으로 끝난다 — 내보내기는 `window.location.href` 로
// 파일을 받고, 변경 이력은 링크다. jsdom 은 이동을 구현하지 않아 **결과를
// 볼 수 없다.** 그래서 이동 자체가 아니라 **이동하기 전에 남기는 것**을 잡는다:
// 어떤 종류로 기록하는지, 그 기록이 화면에 어떻게 되돌아오는지.
//
// backupStatus 는 목으로 바꾸지 않고 실제 구현을 태운다. 이 기능의 값어치가
// "누른 것이 localStorage 에 실제로 남고 다음 렌더에 보이는가" 에 있다.
//
// 이 파일을 돌리면 jsdom 이 `Not implemented: navigation to another Document` 를
// 몇 줄 찍는다. **정상이다** — 내보내기 버튼이 실제로 이동을 걸었다는 뜻이라
// 오히려 신호에 가깝다. 전역으로 막지 않는다. 막으면 진짜 의도치 않은 이동까지
// 함께 가려져서, 그때는 아무 표시 없이 지나간다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

function mockApi() {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/categories')) return Promise.resolve([]);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    if (url.startsWith('/api/settings')) return Promise.resolve({ initial_balance: 0, monthly_income: 0 });
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve([]);
    if (url.startsWith('/api/accounts')) return Promise.resolve({ data: [] });
    return Promise.resolve([]);
  });
}

const renderSettings = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

const sectionBy = async (name) => {
  const h = await screen.findByRole('heading', { name });
  return within(h.closest('section'));
};

const KEY = (kind) => `ft.lastExport.${kind}`;

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('데이터 내보내기', () => {
  const exportSection = () => sectionBy('데이터 내보내기');

  it('기간은 비워 둘 수 있다', async () => {
    renderSettings();
    const sec = await exportSection();

    // CSV 전용 선택 항목이다. 필수로 만들면 전체 내보내기가 막힌다.
    expect(sec.getByLabelText('시작일 (CSV, 선택)').value).toBe('');
    expect(sec.getByLabelText('종료일 (CSV, 선택)').value).toBe('');
  });

  it('CSV 를 누르면 거래내역 종류로 기록한다', async () => {
    renderSettings();
    const sec = await exportSection();

    await userEvent.click(sec.getByRole('button', { name: 'CSV 다운로드 (거래내역)' }));

    // 기록이 안 남으면 "마지막 내보내기" 가 영영 비어 있고, 사용자는 백업했는지
    // 알 방법이 없다.
    expect(window.localStorage.getItem(KEY('transactions'))).toBeTruthy();
  });

  it('JSON 도 같은 종류로 기록한다', async () => {
    renderSettings();
    const sec = await exportSection();

    await userEvent.click(sec.getByRole('button', { name: 'JSON 다운로드 (전체 백업)' }));

    expect(window.localStorage.getItem(KEY('transactions'))).toBeTruthy();
  });

  it('기록한 시각은 ISO 문자열이다', async () => {
    renderSettings();
    const sec = await exportSection();

    await userEvent.click(sec.getByRole('button', { name: 'CSV 다운로드 (거래내역)' }));

    // formatSince 가 Date.parse 로 읽는다. 다른 형식이 들어가면 조용히 null 이
    // 되어 표시가 사라진다.
    const iso = window.localStorage.getItem(KEY('transactions'));
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });

  it('누르고 나면 마지막 내보내기 표시가 바뀐다', async () => {
    renderSettings();
    const sec = await exportSection();

    expect(sec.getByText(/아직 거래내역을 내보낸 적이 없어요/)).toBeTruthy();

    await userEvent.click(sec.getByRole('button', { name: 'CSV 다운로드 (거래내역)' }));

    // 눌렀는데 화면이 그대로면 눌린 줄 모른다.
    await waitFor(() => expect(sec.getByText(/마지막 내보내기/)).toBeTruthy());
    expect(sec.getByText('방금')).toBeTruthy();
  });

  it('다른 절의 기록은 건드리지 않는다', async () => {
    renderSettings();
    const sec = await exportSection();

    await userEvent.click(sec.getByRole('button', { name: 'CSV 다운로드 (거래내역)' }));

    // 세 절이 각자 다른 종류를 쓴다. 하나로 합치면 설정만 내보내고도
    // 거래내역을 백업한 것처럼 보인다.
    expect(window.localStorage.getItem(KEY('settings'))).toBeNull();
    expect(window.localStorage.getItem(KEY('data'))).toBeNull();
  });
});

describe('마지막 내보내기 표시', () => {
  // 세 절이 각자 다른 종류를 읽는지 본다. 한 절만 보면 종류가 뒤섞여도 통과한다.
  const CASES = [
    { heading: '데이터 내보내기', kind: 'transactions', label: '거래내역' },
    { heading: '설정 백업 / 복원', kind: 'settings', label: '설정' },
    { heading: '거래내역 백업 / 복원', kind: 'data', label: '전체 데이터' },
  ];

  for (const { heading, kind, label } of CASES) {
    it(`${heading} 은 ${kind} 기록을 읽는다`, async () => {
      window.localStorage.setItem(KEY(kind), new Date(Date.now() - 3 * 3600_000).toISOString());
      renderSettings();
      const sec = await sectionBy(heading);

      expect(sec.getByText('3시간 전')).toBeTruthy();
    });

    it(`${heading} 은 기록이 없으면 ${label} 을 이름으로 안내한다`, async () => {
      renderSettings();
      const sec = await sectionBy(heading);

      // 조사가 틀리면 '전체 데이터을' 이 된다 — 실제로 그렇게 나온 적이 있다.
      const expected = label === '전체 데이터' ? '전체 데이터를' : `${label}을`;
      expect(sec.getByText(new RegExp(`아직 ${expected} 내보낸 적이 없어요`))).toBeTruthy();
    });
  }

  it('7일이 넘으면 상대 표현 대신 날짜를 보여준다', async () => {
    window.localStorage.setItem(KEY('transactions'), '2020-03-05T01:02:03.000Z');
    renderSettings();
    const sec = await sectionBy('데이터 내보내기');

    // 오래된 것을 '1780일 전' 이라고 하면 감이 안 온다.
    expect(sec.getByText('2020-03-05')).toBeTruthy();
  });

  it('깨진 값이 남아 있으면 없는 것으로 본다', async () => {
    window.localStorage.setItem(KEY('transactions'), '언젠가');
    renderSettings();
    const sec = await sectionBy('데이터 내보내기');

    // Date.parse 가 NaN 이면 표시를 지운다. 'NaN일 전' 이 뜨면 안 된다.
    expect(sec.getByText(/아직 거래내역을 내보낸 적이 없어요/)).toBeTruthy();
  });

  it('이 브라우저 기준이라는 것을 함께 적는다', async () => {
    window.localStorage.setItem(KEY('transactions'), new Date().toISOString());
    renderSettings();
    const sec = await sectionBy('데이터 내보내기');

    // 값이 localStorage 에만 있어 다른 기기에서는 비어 있다. "백업된 시각" 이라고
    // 읽히면 사실보다 큰 주장이 된다(#198).
    expect(sec.getByText('(이 브라우저 기준)')).toBeTruthy();
  });
});

describe('변경 이력', () => {
  it('이력 화면으로 가는 링크를 준다', async () => {
    renderSettings();
    const sec = await sectionBy('변경 이력');

    const link = sec.getByRole('link', { name: '변경 이력 보기' });
    expect(link.getAttribute('href')).toBe('/settings/history');
  });

  it('무엇을 할 수 있는 화면인지 알린다', async () => {
    renderSettings();
    const sec = await sectionBy('변경 이력');

    // 링크만 있으면 눌러 보기 전까지 무엇이 나오는지 모른다.
    expect(sec.getByText(/잘못 바꾼 것을 되돌립니다/)).toBeTruthy();
  });
});

describe('데이터 위치 안내', () => {
  it('어디에 저장되는지 먼저 밝힌다', async () => {
    renderSettings();
    const sec = await sectionBy('내 데이터는 어디에 있나요');

    expect(sec.getByText(/이 기기의 파일/)).toBeTruthy();
  });

  it('외부 호출이 아예 없다고 말하지 않는다', async () => {
    renderSettings();
    const sec = await sectionBy('내 데이터는 어디에 있나요');

    // 환율·주가는 실제로 외부를 부른다. "외부로 전송되지 않습니다" 라고만 쓰면
    // 외부 호출 자체가 없다는 오해를 준다 — 신뢰를 주려는 화면에서 사실보다
    // 큰 주장은 역효과다(#198).
    expect(sec.getByText(/환율과 주가를 불러올 때만 외부 API 를/)).toBeTruthy();
  });
});
