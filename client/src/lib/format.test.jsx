import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatWon, formatNumber } from './format';

// #236 — 금액 표기 정본.
//
// 같은 한 줄이 20개 파일에 글자 그대로 복사돼 있었다. 지금은 우연히 전부
// 같지만 한 곳만 바뀌면 화면마다 표기가 갈린다.
//
// 이 파일이 잠그는 것 둘.
//   1. 표기 규칙 자체 (#291 이 balanceView 에 세워 둔 것을 그대로 이어받았다)
//   2. **중복이 다시 생기지 않는가** — 이게 이 이슈의 본론이다

describe('formatWon', () => {
  it('천 단위를 구분하고 원을 붙인다', () => {
    expect(formatWon(1000000)).toBe('1,000,000원');
    expect(formatWon(1234567)).toBe('1,234,567원');
  });

  it('0 은 0원이다', () => {
    expect(formatWon(0)).toBe('0원');
  });

  it('음수를 그대로 적는다', () => {
    expect(formatWon(-12000)).toBe('-12,000원');
  });

  it('값이 없거나 숫자가 아니면 0원이다', () => {
    // 화면에 'NaN원' 이 뜨는 것보다 낫다.
    expect(formatWon(null)).toBe('0원');
    expect(formatWon(undefined)).toBe('0원');
    expect(formatWon(NaN)).toBe('0원');
    expect(formatWon('abc')).toBe('0원');
  });

  it('소수는 반올림한다 — 원 아래는 표기하지 않는다', () => {
    // 이자·예측 계산에서 소수가 나온다.
    expect(formatWon(1234.6)).toBe('1,235원');
    expect(formatWon(1234.4)).toBe('1,234원');
    expect(formatWon(1234567)).not.toContain('.');
  });

  it('로케일을 명시한다 — 실행 환경을 따라가지 않는다', () => {
    // 생략하면 de-DE 같은 환경에서 1.234.567 로 나온다.
    expect(formatWon(1234567)).toBe('1,234,567원');
  });
});

describe('formatNumber', () => {
  it('단위 없이 자릿수만 구분한다', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(0)).toBe('0');
  });
});

describe('중복이 다시 생기지 않는다', () => {
  const SRC = path.join(process.cwd(), 'src');

  function sourceFiles(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...sourceFiles(full));
      else if (/\.jsx?$/.test(e.name) && !e.name.includes('.test.')) out.push(full);
    }
    return out;
  }

  const files = sourceFiles(SRC).map((f) => ({
    rel: path.relative(SRC, f),
    src: fs.readFileSync(f, 'utf8'),
  }));

  it('복사된 한 줄 포매터가 남아 있지 않다', () => {
    // 이 이슈가 없애려던 바로 그 문자열이다.
    // 정본은 제외한다 — 무엇을 없앴는지 주석에 그 한 줄을 그대로 적어 뒀다.
    const DUP = "Number(n || 0).toLocaleString('ko-KR') + '원'";
    const offenders = files
      .filter((f) => f.rel !== 'lib/format.js')
      .filter((f) => f.src.includes(DUP))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('formatWon 정의는 정본 한 곳뿐이다', () => {
    // 같은 이름의 함수가 두 곳에 서로 다른 반올림 규칙으로 있었던 적이 있다
    // (#291 의 balanceView). 재수출은 정의가 아니므로 걸리지 않는다.
    const offenders = files
      .filter((f) => f.rel !== 'lib/format.js')
      .filter((f) => /(export\s+)?function formatWon\s*\(/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('lib/format.js 밖에서 ko-KR 로케일을 직접 쓰는 곳을 목록으로 고정한다', () => {
    // 전부 금지하지는 않는다 — 건 수('12건')나 축 라벨처럼 '원' 이 아닌 자리가
    // 정당하게 있다. 다만 **새로 늘어나면 드러나야** 한다. 늘었다면 그게
    // 통화 표기인지 보고, 맞다면 formatWon 을 쓰고 아니면 이 목록에 추가한다.
    const ALLOWED = [
      'components/SpendHeatmap.jsx',
      'components/TransactionCalendar.jsx',
      'lib/format.js',
      'pages/Comparison.jsx',
      'pages/Dashboard.jsx',
      'pages/Settings.jsx',
      'pages/Simulator.jsx',
    ];
    const using = files
      .filter((f) => f.src.includes("toLocaleString('ko-KR')"))
      .map((f) => f.rel)
      .sort();
    expect(using).toEqual(ALLOWED);
  });
});
