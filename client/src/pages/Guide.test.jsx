import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Guide from './Guide';

// 앱 안에서 보는 사용 설명서. 테스트가 하나도 없었다.
//
// 서버가 docs/GUIDE.md 를 **마크다운 텍스트 그대로** 내려주고 이 화면이 그린다.
// 다른 화면과 달리 JSON 이 아니라 문자열을 받는 유일한 자리라, 응답을 객체로
// 다루는 순간 조용히 빈 화면이 된다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

function renderMarkdown(md) {
  get.mockResolvedValue(md);
  return render(<Guide />);
}

const settled = () => waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());

beforeEach(() => {
  vi.clearAllMocks();
});

describe('문서 표시', () => {
  it('가이드를 받아 마크다운으로 그린다', async () => {
    get.mockResolvedValue('# 시작하기\n\n첫 거래를 넣어 보세요.');
    render(<Guide />);
    await settled();

    expect(get).toHaveBeenCalledWith('/api/guide');
    // 원문 그대로 뿌리면 '# 시작하기' 가 글자로 보인다. 제목으로 그려져야 한다.
    expect(screen.getByRole('heading', { name: '시작하기' })).toBeTruthy();
    expect(screen.getByText('첫 거래를 넣어 보세요.')).toBeTruthy();
  });

  it('목록과 강조도 마크다운으로 처리한다', async () => {
    get.mockResolvedValue('- 첫째\n- 둘째\n\n**중요한 것**');
    render(<Guide />);
    await settled();

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('중요한 것').tagName).toBe('STRONG');
  });

  it('링크는 눌리는 링크로 그린다', async () => {
    get.mockResolvedValue('[설정으로](/settings)');
    render(<Guide />);
    await settled();

    const link = screen.getByRole('link', { name: '설정으로' });
    expect(link.getAttribute('href')).toBe('/settings');
  });

  it('문서가 비어 있어도 화면은 뜬다', async () => {
    get.mockResolvedValue('');
    render(<Guide />);
    await settled();

    // 빈 문자열에서 렌더가 죽으면 가이드 메뉴 자체가 못 쓰게 된다.
    expect(screen.getByRole('heading', { name: '가이드' })).toBeTruthy();
  });
});

describe('불러오기 실패', () => {
  it('사유를 화면에 남긴다', async () => {
    get.mockRejectedValue(new Error('404'));
    render(<Guide />);
    await settled();

    // 로딩만 걷히고 아무것도 없으면 화면이 고장 난 것으로 읽힌다.
    expect(screen.getByText('가이드 문서를 불러오지 못했습니다.')).toBeTruthy();
  });

  it('실패해도 로딩 상태에 갇히지 않는다', async () => {
    get.mockRejectedValue(new Error('네트워크'));
    render(<Guide />);

    // finally 가 빠지면 '로딩 중...' 인 채로 영영 멈춘다.
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    expect(screen.getByRole('heading', { name: '가이드' })).toBeTruthy();
  });

  // '실패하면 본문을 안 그린다' 는 여기서 잠글 수 없다. 성공했을 때만 content 가
  // 채워지므로 실패 경로에서는 content 가 늘 빈 문자열이고, 삼항을 없애 둘을
  // 함께 그려도 화면 결과가 같다. 돌연변이로 확인했다 — 등가 변이다.
  //
  // 마찬가지로 마크다운 링크의 커스텀 컴포넌트를 지워도 안 잡힌다. 지워도
  // ReactMarkdown 이 평범한 <a href> 를 그려서 역할과 주소는 그대로고, 달라지는
  // 것은 className 뿐이다. 스타일까지 테스트로 붙들 자리는 아니라고 봤다.
});

// #490 에서 더한 것. 위 검사들이 '마크다운이 처리되는가' 를 본다면, 아래는
// **마커가 눈에 보이는가** 를 본다. Tailwind preflight 가 ol·ul 의 list-style 을
// 지우므로 Guide.jsx 의 components 매핑이 빠지면 번호가 사라진다 — 목록 항목
// 개수만 세면 이 상태가 통과한다.
describe('목록 마커', () => {
  // #490. 절차를 번호로 적은 문단이 번호 없이 나오던 자리다.
  //
  // preflight 의 `ol, ul, menu { list-style: none }` 때문에 ol 은 매핑이 없으면
  // 마커가 사라진다. ul 은 매핑이 있어 멀쩡했고 ol 만 빠져 있어서, 반복 거래
  // 등록처럼 순서가 뜻을 갖는 설명이 그냥 줄글로 보였다.
  //
  // 마커가 살아 있는지를 클래스로 확인한다 — jsdom 은 CSS 를 적용하지 않아
  // 계산된 list-style 을 물어볼 수 없고, 마커 자체도 그려지지 않는다.
  it('번호 목록에 번호 마커를 남긴다', async () => {
    const { container } = renderMarkdown('1. 설정으로 갑니다\n2. 추가를 누릅니다\n');

    await waitFor(() => expect(container.querySelector('ol')).not.toBeNull());

    const ol = container.querySelector('ol');
    expect(ol.className).toContain('list-decimal');
    expect(ol.querySelectorAll('li')).toHaveLength(2);
  });

  it('글머리 목록에 점 마커를 남긴다', async () => {
    const { container } = renderMarkdown('- 홈\n- 거래\n');

    await waitFor(() => expect(container.querySelector('ul')).not.toBeNull());
    expect(container.querySelector('ul').className).toContain('list-disc');
  });
});

describe('docs/GUIDE.md 실물', () => {
  const guide = fs.readFileSync(
    path.resolve(__dirname, '../../../docs/GUIDE.md'),
    'utf-8'
  );

  it('화면 이름이 네비게이션 라벨과 같다', () => {
    // nav.js 의 1차 그룹 라벨. 이름이 갈라지면 사용자는 가이드에서 읽은 화면을
    // 네비게이션에서 못 찾는다 — #490 이 "화면 이름과 라벨을 일치시킬 것" 으로
    // 요구한 것이 이 부분이다.
    for (const label of ['홈', '거래', '분석', '자산·부채', '설정']) {
      expect(guide).toContain(`## ${label}`);
    }
  });

  it('M9~M14 에서 들어온 기능을 다룬다', () => {
    // #490 본문이 "문서 내 언급 0회" 로 센 항목들이다.
    //
    // 기능 이름 그대로가 아니라 **그 화면에만 있는 말**로 고른다. '카드' 처럼
    // 흔한 낱말은 다른 문단에 우연히 들어 있어도 통과하므로, 카드 전략 화면은
    // 그 화면의 절 제목인 '전월 실적' 으로 확인한다.
    //
    // '통장' 과 '카드대금 인출' 은 뺐다. #490 이 셀 때는 있던 기능인데 계좌·결제방식
    // 축 제거(#524)로 사라진다 — 없는 기능을 문서에 요구하면 이 검사가 문서를
    // 틀리게 만든다. '마이너스통장' 은 대출 유형이라 그 제거와 무관하게 남는다.
    for (const feature of [
      '반복 거래', '전월 실적', '변경 이력', '되돌리기',
      '달력', '마이너스통장',
    ]) {
      expect(guide).toContain(feature);
    }
  });

  it('렌더러가 못 그리는 표기를 쓰지 않는다', async () => {
    // 표는 remark-gfm 이 있어야 표가 된다. 지금은 없으므로 문서에 표를 쓰면
    // 화면에 파이프 문자가 그대로 찍힌다. 코드펜스 안은 원문 그대로 보이는
    // 것이 맞으므로 검사 대상에서 뺀다.
    const withoutFences = guide.replace(/```[\s\S]*?```/g, '');
    const tableRows = withoutFences
      .split('\n')
      .filter((line) => /^\s*\|.*\|\s*$/.test(line));
    expect(tableRows).toEqual([]);

    // 위 검사가 문법만 본다면, 이건 실제로 그려 본 결과를 본다.
    const { container } = renderMarkdown(guide);
    await waitFor(() => expect(container.querySelector('h1')).not.toBeNull());
    expect(container.textContent).not.toContain('|');
  });

  // ol 매핑을 고친 것은 이 문서가 절차를 번호로 적기 때문이다. 절차가 전부
  // 글머리표로 바뀌면 고친 이유가 사라지는데, 렌더러 테스트는 자기 픽스처를
  // 쓰므로 그 변화를 모른다. 문서 쪽에서 한 번 잠근다.
  it('절차를 번호 목록으로 적는다', async () => {
    const { container } = renderMarkdown(guide);
    await waitFor(() => expect(container.querySelector('h1')).not.toBeNull());

    const lists = container.querySelectorAll('ol');
    expect(lists.length).toBeGreaterThan(0);
    for (const ol of lists) {
      expect(ol.className).toContain('list-decimal');
    }
  });

  it('매핑이 없는 제목 단계를 쓰지 않는다', () => {
    // components 에 h1~h3 만 있다. h4 이하는 클래스 없이 나가 본문과
    // 구분되지 않는다.
    expect(guide.split('\n').filter((l) => /^#{4,}\s/.test(l))).toEqual([]);
  });
});
