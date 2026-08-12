import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TransactionForm from './TransactionForm';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

const categories = [
  { id: 1, name: '식비', major_type: '변동필수', monthly_budget: 300000 },
  { id: 2, name: '급여', major_type: '수입', monthly_budget: null },
];
const paymentMethods = [{ id: 10, name: '신한카드', type: '신용' }];

// api.get 은 주소로 갈라 응답한다. 한 응답으로 뭉뚱그리면 최근 가맹점 목록과
// 카테고리 제안이 서로의 값을 받는다.
function routeGet({ merchants = ['스타벅스', '배달의민족'], suggest = { category_id: 1, confidence: 'high' }, suggestFails = false } = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes('suggest/merchants')) return Promise.resolve({ data: merchants });
    if (url.includes('suggest/category')) {
      return suggestFails ? Promise.reject(new Error('제안 실패')) : Promise.resolve(suggest);
    }
    if (url.includes('category-breakdown')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

function renderForm(props = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(<TransactionForm categories={categories} paymentMethods={paymentMethods}
    onSave={onSave} onCancel={onCancel} {...props} />);
  return { onSave, onCancel };
}

beforeEach(() => { vi.clearAllMocks(); routeGet(); });

describe('TransactionForm Suggest Tests', () => {
  describe('A. 최근 가맹점 칩', () => {
    it('A-1. 그리기 | 최근 가맹점 칩으로 스타벅스 와 배달의민족 이 보인다', async () => {
      renderForm();
      const chip1 = await screen.findByRole('button', { name: '스타벅스' });
      const chip2 = await screen.findByRole('button', { name: '배달의민족' });
      expect(chip1).toBeTruthy();
      expect(chip2).toBeTruthy();
    });

    it('A-2. 그리기 | 최근 가맹점 응답이 빈 배열', async () => {
      routeGet({ merchants: [] });
      renderForm();
      // 응답이 도착한 뒤에 확인한다. 즉시 보면 "아직 안 온 것" 과 구분되지 않고,
      // 렌더가 테스트 밖에서 끝나 act 경고가 난다.
      await waitFor(() => expect(api.get).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole('button', { name: '스타벅스' })).toBeNull());
    });
  });

  it('A-3. 최근 가맹점이 많아도 칩은 5개까지만 나온다', async () => {
    // 픽스처가 2개뿐이면 5개 제한을 없애도 통과한다 — 제한을 실제로 넘겨야 잠긴다.
    routeGet({ merchants: ['가', '나', '다', '라', '마', '바', '사'] });
    renderForm();
    await screen.findByRole('button', { name: '가' });
    const chips = ['가', '나', '다', '라', '마', '바', '사']
      .filter((n) => screen.queryByRole('button', { name: n }) !== null);
    expect(chips).toEqual(['가', '나', '다', '라', '마']);
  });

  describe('B. 칩 클릭', () => {
    it('B-1. 칩 클릭 | 가맹점 입력값이 스타벅스 가 된다', async () => {
      renderForm();
      const chip = await screen.findByRole('button', { name: '스타벅스' });
      await userEvent.click(chip);
      expect(screen.getByLabelText(/가맹점\/내용/).value).toBe('스타벅스');
    });

    it('B-2. 칩 클릭 | suggest/category 를 부르고 주소에 merchant= 와 인코딩된 이름이 들어간다', async () => {
      renderForm();
      const chip = await screen.findByRole('button', { name: '스타벅스' });
      await userEvent.click(chip);
      expect(api.get.mock.calls.some(([url]) => url.includes('merchant=%EC%8A%A4%ED%83%80%EB%B2%85%EC%8A%A4'))).toBe(true);
    });

    it('B-3. 칩 클릭 후 | 카테고리 선택값이 제안된 1 이 된다', async () => {
      renderForm();
      const chip = await screen.findByRole('button', { name: '스타벅스' });
      await userEvent.click(chip);
      expect(screen.getByLabelText(/카테고리 \*/).value).toBe('1');
    });

    it('B-4. 칩 클릭 후 | 확신도 뱃지 high 가 보인다', async () => {
      renderForm();
      const chip = await screen.findByRole('button', { name: '스타벅스' });
      await userEvent.click(chip);
      expect(screen.getByText('high')).toBeTruthy();
    });
  });

  describe('C. 칩 클릭 후 카테고리가 이미 있는 경우', () => {
    it('C-1. 칩 클릭 후 | 가맹점명은 들어가지만 suggest/category 를 부르지 않는다', async () => {
      renderForm();
      const categorySelect = screen.getByLabelText(/카테고리 \*/);
      await userEvent.selectOptions(categorySelect, '1');
      const chip = await screen.findByRole('button', { name: '스타벅스' });
      await userEvent.click(chip);
      const suggestCalls = () =>
        api.get.mock.calls.filter(([url]) => url.includes('suggest/category'));
      expect(suggestCalls().length).toBe(0);
    });

    it('C-2. 위 상황 | 이미 고른 카테고리가 안 바뀐다', async () => {
      renderForm();
      const categorySelect = screen.getByLabelText(/카테고리 \*/);
      await userEvent.selectOptions(categorySelect, '1');
      const chip = await screen.findByRole('button', { name: '스타벅스' });
      await userEvent.click(chip);
      expect(categorySelect.value).toBe('1');
    });
  });

  describe('D. 가맹점 직접 입력 후 블러', () => {
    it('D-1. 직접 입력 후 블러 | suggest/category 를 부른다', async () => {
      renderForm();
      const merchantInput = screen.getByLabelText(/가맹점\/내용/);
      await userEvent.type(merchantInput, '스타벅스');
      await userEvent.tab(); // blur
      const suggestCalls = () =>
        api.get.mock.calls.filter(([url]) => url.includes('suggest/category'));
      expect(suggestCalls().length).toBe(1);
    });

    it('D-2. 가맹점이 빈 값인 채로 블러 | 부르지 않는다', async () => {
      renderForm();
      await userEvent.tab(); // 가맹점 칸을 거쳐 나가며 블러를 낸다
      const suggestCalls = () =>
        api.get.mock.calls.filter(([url]) => url.includes('suggest/category'));
      expect(suggestCalls().length).toBe(0);
    });

    it('D-3. 가맹점이 있고 카테고리도 이미 있는 채로 블러 | 부르지 않는다', async () => {
      renderForm();
      const categorySelect = screen.getByLabelText(/카테고리 \*/);
      await userEvent.selectOptions(categorySelect, '1');
      const merchantInput = screen.getByLabelText(/가맹점\/내용/);
      await userEvent.type(merchantInput, '스타벅스');
      await userEvent.tab(); // blur
      const suggestCalls = () =>
        api.get.mock.calls.filter(([url]) => url.includes('suggest/category'));
      expect(suggestCalls().length).toBe(0);
    });

    it('D-4. 블러로 제안이 오면 | 카테고리가 채워지고 확신도 뱃지가 뜬다', async () => {
      renderForm();
      const merchantInput = screen.getByLabelText(/가맹점\/내용/);
      await userEvent.type(merchantInput, '스타벅스');
      await userEvent.tab(); // blur
      expect(screen.getByLabelText(/카테고리 \*/).value).toBe('1');
      expect(screen.getByText('high')).toBeTruthy();
    });
  });

  describe('E. 제안 실패', () => {
    it('E-1. 제안이 실패(거절)하면 | 화면이 죽지 않고 카테고리는 비어 있다', async () => {
      routeGet({ suggestFails: true });
      renderForm();
      const merchantInput = screen.getByLabelText(/가맹점\/내용/);
      await userEvent.type(merchantInput, '스타벅스');
      await userEvent.tab(); // blur
      expect(screen.getByLabelText(/카테고리 \*/).value).toBe('');
    });

    it('E-2. 제안 실패 후 | «제안 중...» 이 사라진다', async () => {
      let resolveSuggest;
      api.get.mockImplementation((url) => {
        if (url.includes('suggest/category')) return new Promise((r) => { resolveSuggest = r; });
        if (url.includes('suggest/merchants')) return Promise.resolve({ data: ['스타벅스'] });
        return Promise.resolve({ data: [] });
      });
      renderForm();
      const merchantInput = screen.getByLabelText(/가맹점\/내용/);
      await userEvent.type(merchantInput, '스타벅스');
      await userEvent.tab(); // blur
      expect(screen.getByText('제안 중...')).toBeTruthy();
      resolveSuggest(Promise.reject(new Error('제안 실패')));
      await waitFor(() => expect(screen.queryByText('제안 중...')).toBeNull());
    });

    it('E-3. 제안이 category_id 없이 { confidence: "low" } 만 주면 | 카테고리는 비어 있고 확신도 뱃지는 "low" 로 뜬다', async () => {
      routeGet({ suggest: { confidence: 'low' } });
      renderForm();
      const merchantInput = screen.getByLabelText(/가맹점\/내용/);
      await userEvent.type(merchantInput, '스타벅스');
      await userEvent.tab(); // blur
      expect(screen.getByLabelText(/카테고리 \*/).value).toBe('');
      expect(screen.getByText('low')).toBeTruthy();
    });
  });

  describe('F. 제안 중 상태', () => {
    it('F-1. 제안 요청이 아직 안 끝났을 때 | «제안 중...» 이 보인다', async () => {
      let resolveSuggest;
      api.get.mockImplementation((url) => {
        if (url.includes('suggest/category')) return new Promise((r) => { resolveSuggest = r; });
        if (url.includes('suggest/merchants')) return Promise.resolve({ data: ['스타벅스'] });
        return Promise.resolve({ data: [] });
      });
      renderForm();
      const merchantInput = screen.getByLabelText(/가맹점\/내용/);
      await userEvent.type(merchantInput, '스타벅스');
      await userEvent.tab(); // blur
      expect(screen.getByText('제안 중...')).toBeTruthy();
      // 확인했으면 풀어 준다. 미해결로 두면 다음 테스트까지 대기가 남는다.
      resolveSuggest({ category_id: 1, confidence: 'high' });
      await waitFor(() => expect(screen.queryByText('제안 중...')).toBeNull());
    });

    it('F-2. 제안이 끝난 뒤 | «제안 중...» 이 사라진다', async () => {
      let resolveSuggest;
      api.get.mockImplementation((url) => {
        if (url.includes('suggest/category')) return new Promise((r) => { resolveSuggest = r; });
        if (url.includes('suggest/merchants')) return Promise.resolve({ data: ['스타벅스'] });
        return Promise.resolve({ data: [] });
      });
      renderForm();
      const merchantInput = screen.getByLabelText(/가맹점\/내용/);
      await userEvent.type(merchantInput, '스타벅스');
      await userEvent.tab(); // blur
      resolveSuggest({ category_id: 1, confidence: 'high' });
      await waitFor(() => expect(screen.queryByText('제안 중...')).toBeNull());
    });
  });

  describe('G. 가맹점 직접 타이핑', () => {
    it('G-1. 가맹점을 직접 타이핑해 바꾸면 | 이전 확신도 뱃지가 사라진다', async () => {
      renderForm();
      const merchantInput = screen.getByLabelText(/가맹점\/내용/);
      await userEvent.type(merchantInput, '스타벅스');
      await userEvent.tab(); // blur
      expect(screen.getByText('high')).toBeTruthy();
      await userEvent.type(merchantInput, '카페');
      expect(screen.queryByText('high')).toBeNull();
    });
  });
});
