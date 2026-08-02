import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import TransactionForm from './TransactionForm';
import { CATEGORY_STYLE } from '../lib/categoryStyle';

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    del: vi.fn(() => Promise.resolve({})),
  },
}));

// 아이콘이 이모지 문자에서 인라인 SVG 키('payments', 'home' 등)로 바뀌면서,
// SVG 를 렌더할 수 없는 자리(<optgroup label>, <option> 텍스트)에 키가 문자열로
// 그대로 노출됐다. 화면에 `payments 수입` 이 떴다.
//
// 키 목록을 하드코딩하지 않고 CATEGORY_STYLE 에서 뽑는다. 아이콘이 늘거나 이름이
// 바뀌어도 검사가 따라온다.
const ICON_KEYS = [...new Set(Object.values(CATEGORY_STYLE).map((s) => s.icon))];

const categories = [
  { id: 1, name: '식비', major_type: '변동필수', monthly_budget: 300000 },
  { id: 2, name: '급여', major_type: '수입', monthly_budget: null },
  { id: 3, name: '월세', major_type: '고정지출', monthly_budget: null },
];
const paymentMethods = [{ id: 10, name: '신한카드' }];

function renderForm() {
  render(
    <TransactionForm
      categories={categories}
      paymentMethods={paymentMethods}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  return document.querySelector('#tx-category');
}

describe('카테고리 선택 라벨', () => {
  it('아이콘 키가 optgroup 라벨에 노출되지 않는다', () => {
    const sel = renderForm();
    expect(sel).toBeTruthy();

    const labels = [...sel.querySelectorAll('optgroup')].map((g) => g.label);
    expect(labels.length).toBeGreaterThan(0);

    const leaked = [];
    for (const label of labels) {
      for (const key of ICON_KEYS) {
        if (label.includes(key)) leaked.push({ label, key });
      }
    }
    expect(leaked).toEqual([]);
  });

  it('대분류 이름은 그대로 나온다', () => {
    const sel = renderForm();
    const labels = [...sel.querySelectorAll('optgroup')].map((g) => g.label);
    for (const type of ['변동필수', '수입', '고정지출']) {
      expect(labels).toContain(type);
    }
  });

  it('옵션 텍스트가 카테고리 이름과 정확히 일치한다', () => {
    const sel = renderForm();
    // 첫 항목은 '선택...' 플레이스홀더라 optgroup 안의 option 만 본다
    const texts = [...sel.querySelectorAll('optgroup option')].map((o) => o.textContent);
    expect(texts.sort()).toEqual(['급여', '식비', '월세']);

    const leaked = texts.filter((t) => ICON_KEYS.some((k) => t.includes(k)));
    expect(leaked).toEqual([]);
  });

  it('검사할 아이콘 키가 실제로 수집됐다', () => {
    // ICON_KEYS 가 비면 위 검사가 아무것도 안 하고 통과한다.
    expect(ICON_KEYS.length).toBeGreaterThanOrEqual(5);
    expect(ICON_KEYS).toContain('payments');
  });
});
