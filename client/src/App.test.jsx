import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

// 앱 껍데기 — 라우팅 표와 상단 내비게이션. 커버리지 0% 였다.
//
// 페이지는 전부 가짜로 바꾼다. 여기서 확인할 것은 **어느 주소가 어느 화면으로
// 가는가**이지 그 화면이 무엇을 그리는가가 아니고, 진짜 페이지를 띄우면
// 십수 개의 API 호출이 따라와 라우팅 결함이 그 소음에 묻힌다.
//
// wouter 는 목으로 바꾸지 않는다. 검사 대상이 라우팅 자체라 진짜를 태워야 한다.
// jsdom 의 history 를 그대로 쓴다.

const page = (name) => ({ default: () => <div>{name} 화면</div> });

vi.mock('./pages/Dashboard', () => page('대시보드'));
vi.mock('./pages/Transactions', () => page('거래내역'));
vi.mock('./pages/Comparison', () => page('기간비교'));
vi.mock('./pages/Installments', () => page('할부'));
vi.mock('./pages/Revolving', () => page('리볼빙'));
vi.mock('./pages/Debts', () => page('부채'));
vi.mock('./pages/Simulator', () => page('시뮬레이터'));
vi.mock('./pages/Savings', () => page('적금'));
vi.mock('./pages/CardStrategy', () => page('카드전략'));
vi.mock('./pages/Accounts', () => page('통장'));
vi.mock('./pages/Settings', () => page('설정'));
vi.mock('./pages/AuditLog', () => page('변경이력'));
vi.mock('./pages/Guide', () => page('가이드'));

// 껍데기 밖의 구성요소는 각자 테스트가 있다. 여기서는 자리만 차지하게 둔다.
vi.mock('./components/CommandPalette', () => ({
  default: ({ open }) => (open ? <div role="dialog" aria-label="화면 검색">팔레트</div> : null),
}));
vi.mock('./components/BottomTabBar', () => ({ default: () => <nav aria-label="하단 탭">탭</nav> }));
vi.mock('./components/WelcomeGate', () => ({ default: () => null }));

const at = (path) => window.history.replaceState(null, '', path);
const show = (name) => screen.findByText(`${name} 화면`);

// lazy 페이지가 풀리면서 상태가 바뀐다. 그냥 render 하면 그 갱신이 act 밖에서
// 일어나 경고가 테스트마다 한 줄씩 쌓인다 — 경고가 쌓이면 진짜 경고를 못 본다.
const mount = async () => { await act(async () => { render(<App />); }); };

// 주소는 **렌더 전에만** 되돌린다. afterEach 로 옮기면 RTL 의 cleanup 보다
// 먼저 돌아, 아직 마운트된 트리에 주소 변경이 날아가고 wouter 가 act 밖에서
// 상태를 바꾼다 — 경고가 테스트마다 열 줄씩 쌓인다(실제로 324줄이 나왔다).
beforeEach(() => { at('/'); });

describe('주소가 화면을 고른다', () => {
  const ROUTES = [
    ['/', '대시보드'],
    ['/transactions', '거래내역'],
    ['/analysis/comparison', '기간비교'],
    ['/analysis/simulator', '시뮬레이터'],
    ['/analysis/cards', '카드전략'],
    ['/assets/accounts', '통장'],
    ['/assets/installments', '할부'],
    ['/assets/revolving', '리볼빙'],
    ['/assets/debts', '부채'],
    ['/assets/savings', '적금'],
    ['/settings', '설정'],
    ['/settings/history', '변경이력'],
    ['/guide', '가이드'],
  ];

  for (const [path, name] of ROUTES) {
    it(`${path} → ${name}`, async () => {
      at(path);
      await mount();

      expect(await show(name)).toBeTruthy();
    });
  }

  it('/settings 가 /settings/history 를 가로채지 않는다', async () => {
    at('/settings/history');
    await mount();

    // wouter 의 Route 는 정확히 일치할 때만 맞으므로 지금은 순서를 바꿔도
    // 결과가 같다(돌연변이로 확인했다). 이 테스트는 그 성질에 기대는 코드가
    // 들어올 때를 위한 잠금이다 — 와일드카드나 nest 를 붙이면 /settings 가
    // 하위를 삼키고, 그때 주소는 맞아서 링크는 정상으로 보인다.
    expect(await show('변경이력')).toBeTruthy();
    expect(screen.queryByText('설정 화면')).toBeNull();
  });
});

describe('묶음 주소는 첫 화면으로 보낸다', () => {
  it('/analysis → /analysis/comparison', async () => {
    at('/analysis');
    await mount();

    expect(await show('기간비교')).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/analysis/comparison'));
  });

  it('/assets → /assets/installments', async () => {
    at('/assets');
    await mount();

    expect(await show('할부')).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/assets/installments'));
  });

  it('모르는 주소는 홈으로 보낸다', async () => {
    at('/이런건없다');
    await mount();

    // 빈 화면을 두면 오타 한 번에 앱이 죽은 것처럼 보인다.
    expect(await show('대시보드')).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });
});

describe('상단 내비게이션', () => {
  it('묶음 다섯을 모두 띄운다', async () => {
    await mount();
    await show('대시보드');

    for (const label of ['홈', '거래', '분석', '자산·부채']) {
      expect(screen.getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it('지금 있는 묶음을 현재 페이지로 표시한다', async () => {
    at('/assets/debts');
    await mount();
    await show('부채');

    // aria-current 가 없으면 스크린리더에서 어디 있는지 알 수 없다.
    expect(screen.getByRole('link', { name: '자산·부채' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '홈' }).getAttribute('aria-current')).toBeNull();
  });

  it('하위 화면에 있어도 묶음이 표시된다', async () => {
    at('/analysis/simulator');
    await mount();
    await show('시뮬레이터');

    // 정확히 일치할 때만 표시하면 하위로 들어가는 순간 표시가 사라진다.
    expect(screen.getByRole('link', { name: '분석' }).getAttribute('aria-current')).toBe('page');
  });

  it('묶음에 하위가 있으면 하위 줄을 편다', async () => {
    at('/analysis/comparison');
    await mount();
    await show('기간비교');

    expect(screen.getByRole('link', { name: '기간비교' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '시뮬레이터' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '카드' })).toBeTruthy();
  });

  it('하위가 없는 묶음에는 하위 줄이 없다', async () => {
    at('/transactions');
    await mount();
    await show('거래내역');

    // 빈 줄이 남으면 화면 위쪽에 이유 없는 여백이 생긴다.
    expect(screen.queryByRole('link', { name: '기간비교' })).toBeNull();
  });

  it('하위 줄은 정확히 그 화면일 때만 표시한다', async () => {
    at('/assets/savings');
    await mount();
    await show('적금');

    expect(screen.getByRole('link', { name: '적금' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '통장' }).getAttribute('aria-current')).toBeNull();
  });

  it('가이드는 아이콘 링크로 따로 둔다', async () => {
    at('/guide');
    await mount();
    await show('가이드');

    const link = screen.getByRole('link', { name: '가이드' });
    expect(link.getAttribute('href')).toBe('/guide');
    expect(link.getAttribute('aria-current')).toBe('page');
  });
});

// #281. 단축키는 데스크톱의 지름길일 뿐이고, 헤더 버튼이 정식 진입점이다 —
// 모바일에는 Cmd+K 가 없다.
describe('화면 검색', () => {
  it('처음에는 닫혀 있다', async () => {
    await mount();
    await show('대시보드');

    expect(screen.queryByRole('dialog', { name: '화면 검색' })).toBeNull();
  });

  it('헤더 버튼으로 연다', async () => {
    await mount();
    await show('대시보드');

    await userEvent.click(screen.getByRole('button', { name: '화면 검색 열기' }));

    expect(screen.getByRole('dialog', { name: '화면 검색' })).toBeTruthy();
  });

  it('Cmd+K 로 여닫는다', async () => {
    await mount();
    await show('대시보드');

    await userEvent.keyboard('{Meta>}k{/Meta}');
    expect(screen.getByRole('dialog', { name: '화면 검색' })).toBeTruthy();

    await userEvent.keyboard('{Meta>}k{/Meta}');
    expect(screen.queryByRole('dialog', { name: '화면 검색' })).toBeNull();
  });

  it('Ctrl+K 도 같이 받는다', async () => {
    await mount();
    await show('대시보드');

    // 맥 밖에서는 Ctrl 이다. 하나만 받으면 절반의 사용자가 못 연다.
    await userEvent.keyboard('{Control>}k{/Control}');

    expect(screen.getByRole('dialog', { name: '화면 검색' })).toBeTruthy();
  });

  it('보조키 없는 k 로는 안 열린다', async () => {
    await mount();
    await show('대시보드');

    await userEvent.keyboard('k');

    // 입력 중에 열리면 글자를 못 친다.
    expect(screen.queryByRole('dialog', { name: '화면 검색' })).toBeNull();
  });
});
