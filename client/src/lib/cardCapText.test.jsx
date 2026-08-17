import { describe, it, expect } from 'vitest';
import { cappedText, unappliedCapNote, estimateReason } from './cardStrategyView';

// 어느 한도에 잘렸는지 화면이 말하는가 (#578).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 «월 한도까지만 계산» 한 마디로는 안 되는가
//
// 한도가 두 층이라 **사용자가 할 일이 정반대**다.
//
//   항목 한도에 걸림   다른 카테고리에 쓰면 이 카드로 더 받는다
//   카드 통합에 걸림   이 카드로는 이번 달 더 못 받는다. 다른 카드를 써야 한다
//
// 두 경우에 같은 문구를 내보내면 화면이 판단 근거를 지운다.
//
// 별 파일로 둔 이유는 `cardStrategyView.test.jsx` 가 다른 트랙에서도 늘어나는
// 파일이라서다. 경계를 겹치지 않게 나눈다.

const card = (over = {}) => ({
  benefit: 4000,
  capped: true,
  applied: { rate: 10, matched: 'all' },
  ...over,
});

describe('A. 잘린 층을 구분해 말한다', () => {
  it('A-1. 카드 월 통합 한도', () => {
    expect(cappedText(card({ cappedBy: 'card-monthly' }))).toBe('카드 월 통합 한도까지만 계산');
  });

  it('A-2. 이 혜택의 월 한도', () => {
    expect(cappedText(card({ cappedBy: 'item-month' }))).toBe('이 혜택의 월 한도까지만 계산');
  });

  it('A-3. 건당 한도', () => {
    expect(cappedText(card({ cappedBy: 'item-transaction' }))).toBe('건당 한도까지만 계산');
  });

  it('A-4. 하루 한도', () => {
    expect(cappedText(card({ cappedBy: 'item-day' }))).toBe('하루 한도까지만 계산');
  });

  it('A-5. 두 층이 서로 다른 문구다 — 같으면 구분이 사라진다', () => {
    const unified = cappedText(card({ cappedBy: 'card-monthly' }));
    const item = cappedText(card({ cappedBy: 'item-month' }));
    expect(unified).not.toBe(item);
  });

  it('A-6. 층을 모르면 예전 문구로 돌아간다 — 옛 monthly_cap 컬럼만 있는 혜택', () => {
    // «한도 종류 불명» 같은 말을 만들지 않는다. 사용자에게는 뜻 없는 구분이다.
    expect(cappedText(card({ cappedBy: null }))).toBe('월 한도까지만 계산');
    expect(cappedText(card({}))).toBe('월 한도까지만 계산');
    expect(cappedText(undefined)).toBe('월 한도까지만 계산');
  });

  it('A-7. 모르는 층 값이 와도 문구가 비지 않는다', () => {
    // 서버가 새 층을 먼저 내보내는 순서가 실제로 생긴다(배포 시점 차이).
    expect(cappedText(card({ cappedBy: 'item-week' }))).toBe('월 한도까지만 계산');
  });
});

describe('B. 근거 한 줄에 그 층이 실린다', () => {
  it('B-1. 통합 한도에 걸리면 근거에도 그렇게 나온다', () => {
    const r = estimateReason(card({ cappedBy: 'card-monthly' }));
    expect(r).toContain('카드 월 통합 한도까지만 계산');
  });

  it('B-2. 항목 한도에 걸리면 근거에도 그렇게 나온다', () => {
    const r = estimateReason(card({ cappedBy: 'item-month' }));
    expect(r).toContain('이 혜택의 월 한도까지만 계산');
  });

  it('B-3. 한도에 안 걸리면 한도 이야기를 하지 않는다', () => {
    const r = estimateReason(card({ capped: false, cappedBy: null }));
    expect(r).not.toContain('한도');
  });
});

describe('C. 아직 계산에 못 넣은 한도를 알린다', () => {
  it('C-1. 하루 한도가 선언돼 있으면 말한다', () => {
    const note = unappliedCapNote(card({ unappliedCapWindows: ['day'] }));
    expect(note).toContain('하루 한도');
    expect(note).toContain('적을 수 있어요');
  });

  it('C-2. 못 넣은 것이 없으면 말하지 않는다', () => {
    expect(unappliedCapNote(card({ unappliedCapWindows: [] }))).toBeNull();
    expect(unappliedCapNote(card({}))).toBeNull();
    expect(unappliedCapNote(undefined)).toBeNull();
  });

  it('C-3. 모르는 창이 와도 «적을 수 있다» 는 말은 남는다', () => {
    // 추정이 실제보다 큰 쪽으로 틀리는 경우라, 창 이름을 몰라도 방향은 알려야 한다.
    const note = unappliedCapNote(card({ unappliedCapWindows: ['week'] }));
    expect(note).toContain('적을 수 있어요');
  });

  it('C-4. 창 이름을 화면에 그대로 내보내지 않는다', () => {
    for (const w of ['day', 'week', 'transaction', 'month']) {
      const note = unappliedCapNote(card({ unappliedCapWindows: [w] })) || '';
      expect(note, w).not.toMatch(/day|week|transaction|month|window|Cap/);
    }
  });
});

describe('D. 문구 전수 검사', () => {
  const strings = [];
  for (const by of ['card-monthly', 'item-month', 'item-transaction', 'item-day', null, 'item-week']) {
    strings.push(cappedText(card({ cappedBy: by })));
    strings.push(estimateReason(card({ cappedBy: by })));
  }
  for (const w of [['day'], ['week'], []]) {
    const note = unappliedCapNote(card({ unappliedCapWindows: w }));
    if (note) strings.push(note);
  }

  it('D-0. 검사 대상이 실제로 잡힌다', () => {
    // 코퍼스가 비면 위반도 0 이라 조용히 통과한다.
    expect(strings.length).toBeGreaterThanOrEqual(12);
  });

  it('D-1. 내부 필드명이 새지 않는다', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/cappedBy|unappliedCapWindows|monthly_cap|rule_json|card-monthly|item-/);
    }
  });

  it('D-2. 홍보성 표현과 겁주기가 없다', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/스마트|알뜰|무려|꿀팁|최적의|하십시오|하시기 바랍니다/);
    }
  });

  it('D-3. 감탄사나 이모지를 붙이지 않는다', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/[!]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });
});
