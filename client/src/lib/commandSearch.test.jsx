import { describe, it, expect } from 'vitest';
import { initials, isChoseongQuery, commandTargets, searchCommands } from './commandSearch';
import { NAV_GROUPS } from './nav';

// #281 — 메뉴·화면 검색.
//
// 가장 중요한 것은 **NAV_GROUPS 와의 동기화가 자동인가** 다. 별도 목록을 두면
// 화면이 늘 때 반드시 한쪽이 빠지고, 그러면 "검색해도 안 나오는 화면" 이 생긴다.
// 사용자는 그 화면이 없다고 판단한다 — 검색을 붙여서 발견성이 나빠지는 결과다.

describe('초성 추출', () => {
  it('한글 음절에서 초성을 뽑는다', () => {
    expect(initials('반복거래')).toBe('ㅂㅂㄱㄹ');
    expect(initials('부채')).toBe('ㅂㅊ');
    expect(initials('통장')).toBe('ㅌㅈ');
  });

  it('한글이 아닌 글자는 그대로 둔다', () => {
    expect(initials('Guide 가이드')).toBe('Guide ㄱㅇㄷ');
    expect(initials('123')).toBe('123');
  });

  it('받침이 있어도 초성만 뽑는다', () => {
    // 음절 = 초성 × 588 + 중성 × 28 + 종성. 종성에 흔들리면 안 된다.
    expect(initials('값')).toBe('ㄱ');
    expect(initials('할부')).toBe('ㅎㅂ');
  });
});

describe('자음 질의 판정', () => {
  it('자음만이면 초성 질의다', () => {
    expect(isChoseongQuery('ㅂㅊ')).toBe(true);
    expect(isChoseongQuery('ㅎㅂ')).toBe(true);
  });

  it('완성 글자가 섞이면 아니다', () => {
    expect(isChoseongQuery('부채')).toBe(false);
    expect(isChoseongQuery('ㅂ채')).toBe(false);
  });

  it('겹자음도 초성 질의로 본다', () => {
    // 사용자가 시프트를 눌러 'ㅃ' 을 칠 이유는 없지만, 쳤다고 막을 이유도 없다.
    expect(isChoseongQuery('ㅃ')).toBe(true);
  });

  it('빈 질의는 아니다', () => {
    expect(isChoseongQuery('')).toBe(false);
    expect(isChoseongQuery('   ')).toBe(false);
  });
});

describe('검색 대상이 NAV_GROUPS 에서 파생된다', () => {
  it('그룹과 하위 화면이 모두 들어간다', () => {
    const expected = NAV_GROUPS.length
      + NAV_GROUPS.reduce((s, g) => s + (g.children?.length || 0), 0);
    expect(commandTargets()).toHaveLength(expected);
  });

  it('NAV_GROUPS 의 모든 경로가 검색 대상에 있다', () => {
    // 이 테스트가 이 파일의 존재 이유다. 화면을 추가했는데 검색에 안 나오면
    // 여기서 실패해야 한다 — 별도 목록을 유지하기 시작하면 반드시 어긋난다.
    const paths = new Set(commandTargets().map((t) => t.path));
    for (const g of NAV_GROUPS) {
      expect(paths.has(g.path)).toBe(true);
      for (const c of g.children || []) {
        expect(paths.has(c.path)).toBe(true);
      }
    }
  });

  it('하위 화면은 속한 그룹을 함께 들고 있다', () => {
    // '할부' 만 보여주면 어디에 있는 화면인지 알 수 없다.
    const t = commandTargets().find((x) => x.path === '/assets/installments');
    expect(t.group).toBe('자산·부채');
  });

  it('최상위 그룹에는 부모가 없다', () => {
    const t = commandTargets().find((x) => x.path === '/transactions');
    expect(t.group).toBeNull();
  });
});

describe('검색', () => {
  it('빈 질의는 전체를 준다', () => {
    expect(searchCommands('')).toHaveLength(commandTargets().length);
  });

  it('이름 일부로 찾는다', () => {
    const r = searchCommands('할부');
    expect(r[0].path).toBe('/assets/installments');
  });

  it('시작 일치가 포함 일치보다 위다', () => {
    const targets = [
      { id: 'a', label: '가계부 정리', path: '/a' },
      { id: 'b', label: '정리', path: '/b' },
    ];
    const r = searchCommands('정리', targets);
    expect(r[0].path).toBe('/b');
  });

  it('초성으로 찾는다', () => {
    // 한글은 조합 중간 상태가 있어 두 글자 치기 전에는 아무것도 안 잡힌다.
    expect(searchCommands('ㅂㅊ').map((x) => x.path)).toContain('/assets/debts');
    expect(searchCommands('ㅌㅈ').map((x) => x.path)).toContain('/assets/accounts');
  });

  it('초성 검색은 자음만 쳤을 때만 돈다', () => {
    // '부' 같은 완성 글자까지 초성으로 견주면 엉뚱한 항목이 걸린다.
    const r = searchCommands('부');
    expect(r.every((x) => x.label.includes('부'))).toBe(true);
  });

  it('겹자음을 홑자음으로 접는다', () => {
    const targets = [{ id: 'x', label: '빠른입력', path: '/x' }];
    expect(searchCommands('ㅂ', targets)).toHaveLength(1);
  });

  it('공백과 대소문자를 무시한다', () => {
    const targets = [{ id: 'x', label: 'Card Policy', path: '/x' }];
    expect(searchCommands('cardpolicy', targets)).toHaveLength(1);
    expect(searchCommands('CARD', targets)).toHaveLength(1);
  });

  it('맞는 것이 없으면 빈 배열이다', () => {
    expect(searchCommands('존재하지않는화면')).toHaveLength(0);
  });

  it('원본 목록을 건드리지 않는다', () => {
    // score 를 원본에 박으면 다음 검색이 오염된다.
    const targets = commandTargets();
    searchCommands('할부', targets);
    expect(targets.every((t) => t.score === undefined)).toBe(true);
  });
});
