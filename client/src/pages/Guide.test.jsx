import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Guide from './Guide';
import { api } from '../lib/api';

// 가이드 화면은 `docs/GUIDE.md` 를 받아 그대로 그린다. 그래서 이 화면의 버그는
// "안 뜬다" 가 아니라 **"떴는데 문서가 아니게 보인다"** 로 나타난다. 목차가
// 본문처럼 보이거나 절차의 번호가 사라지는 식이라, 화면이 죽지 않으니
// 스모크 테스트로는 안 잡힌다(pageSmoke 는 "열면 죽는가" 만 본다).
//
// 마크다운 요소마다 components 매핑이 필요한 이유가 여기 있다. Tailwind
// preflight 가 h1~h6 · ol · ul 의 기본 표시를 지우므로, 매핑을 빠뜨린 요소는
// 클래스 없이 맨몸으로 나가서 본문 글자와 구분되지 않는다.

vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
}));

beforeEach(() => {
  api.get.mockReset();
});

function renderMarkdown(md) {
  api.get.mockResolvedValue(md);
  return render(<Guide />);
}

describe('가이드 화면', () => {
  it('문서를 받아 화면에 그린다', async () => {
    const { container } = renderMarkdown('## 홈\n\n이번 달 현황을 봅니다.\n');

    await waitFor(() => expect(container.querySelector('h2')).not.toBeNull());
    expect(api.get).toHaveBeenCalledWith('/api/guide');
    expect(screen.getByText('홈')).toBeTruthy();
    expect(screen.getByText('이번 달 현황을 봅니다.')).toBeTruthy();
  });

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

  it('문서를 못 불러오면 안내를 낸다', async () => {
    api.get.mockRejectedValue(new Error('boom'));
    render(<Guide />);

    await waitFor(() => expect(screen.getByText('가이드 문서를 불러오지 못했습니다.')).toBeTruthy());
  });
});

// 실제 문서를 넣고 그려 본다. 위 테스트들이 보는 것은 "이런 마크다운이 오면
// 이렇게 그린다" 이고, 여기서 보는 것은 "**지금 저장소에 있는 문서**가 그
// 조건을 지키는가" 다. 문서만 고쳐서 깨지는 경우가 여기서 잡힌다 — 예를 들어
// 표를 넣으면 remark-gfm 이 없어 파이프 문자가 본문에 그대로 찍힌다.
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
    for (const feature of [
      '반복 거래', '전월 실적', '변경 이력', '되돌리기',
      '통장', '달력', '카드대금 인출', '마이너스통장',
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
