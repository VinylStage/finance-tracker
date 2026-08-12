import { describe, it, expect } from 'vitest';
import { searchCommands, commandTargets, initials } from './commandSearch';
import { comparisonView } from './cardStrategyView';

describe('검색 — 포함 일치와 동점 처리', () => {
  it('1. 가운데에 걸리는 것도 결과에 들어간다', () => {
    const all = commandTargets();
    const labels = searchCommands('부채', all).map((t) => t.label);
    expect(labels).toContain('자산·부채');
    expect(labels).toContain('부채');
    expect(labels.indexOf('부채')).toBeLessThan(labels.indexOf('자산·부채'));
  });

  it('2. 점수가 같으면 이름순으로 정렬한다', () => {
    const all = commandTargets();
    const labels = searchCommands('ㅂ', all).map((t) => t.label);
    expect(labels).toContain('분석');
    expect(labels).toContain('부채');
    expect(labels.indexOf('부채')).toBeLessThan(labels.indexOf('분석'));
  });

  it('3. 한글 마지막 음절도 초성으로 접힌다', () => {
    expect(initials('힣')).toBe('ㅎ');

    const targets = [{ label: '힣', path: '/x' }];
    expect(searchCommands('ㅎ', targets).map((t) => t.label)).toContain('힣');
  });

  it('4. 한글 첫 음절도 접힌다', () => {
    expect(initials('가')).toBe('ㄱ');

    const targets = [{ label: '가', path: '/x' }];
    expect(searchCommands('ㄱ', targets).map((t) => t.label)).toContain('가');
  });
});

describe('카드 전략 — 거래가 없을 때', () => {
  it('5. 비교는 가능한데 상세가 비면 no-transactions 다', () => {
    const vm = comparisonView({ data: { comparable: true, details: [], byCard: [] } });
    expect(vm.state).toBe('no-transactions');
  });

  it('6. 상세가 있으면 정상 상태다', () => {
    const vm = comparisonView({
      data: { comparable: true, details: [{ category: '식비', amount: 1000 }], byCard: [] },
    });
    expect(vm.state).toBe('ok');
  });
});
