import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DerivedBadge from './DerivedBadge';
import {
  isDerived, originLabel, originIcon, originHref, originLinkText, originHint,
  derivedEndpoint, anchorId,
} from '../lib/derivedOrigin';

// 링크는 목적지만 검사한다. 진짜 wouter 를 태우면 Router 컨텍스트가 필요하다.
vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock('./Icon', () => ({
  default: ({ name }) => <span data-icon={name} />,
}));

const INSTALLMENT = {
  origin: 'installment',
  origin_ref_id: 7,
  origin_seq: 3,
  origin_seq_total: 12,
};

const MANUAL = { origin: 'manual' };

describe('derivedOrigin', () => {
  describe('isDerived', () => {
    it('manual 은 파생이 아니다', () => {
      expect(isDerived({ origin: 'manual' })).toBeFalsy();
      expect(isDerived({})).toBeFalsy();
      expect(isDerived(null)).toBeFalsy();
    });

    it('네 가지 출처는 파생이다', () => {
      expect(isDerived({ origin: 'installment' })).toBeTruthy();
      expect(isDerived({ origin: 'revolving' })).toBeTruthy();
      expect(isDerived({ origin: 'debt_interest' })).toBeTruthy();
      expect(isDerived({ origin: 'debt_repayment' })).toBeTruthy();
    });

    it('할부는 회차 번호를 라벨에 넣는다', () => {
      expect(originLabel(INSTALLMENT)).toBe('할부 3/12회차');
    });

    it('회차 번호가 없으면 종류만 말한다', () => {
      expect(originLabel({ origin: 'installment', origin_ref_id: 7 })).toBe('할부');
    });

    it('다른 출처의 라벨', () => {
      expect(originLabel({ origin: 'revolving' })).toBe('리볼빙 수수료');
      expect(originLabel({ origin: 'debt_interest' })).toBe('대출 이자');
      expect(originLabel({ origin: 'debt_repayment' })).toBe('대출 상환');
    });

    it('알 수 없는 출처는 빈 문자열을 준다', () => {
      expect(originLabel(MANUAL)).toBe('');
      expect(originIcon(MANUAL)).toBeNull();
      expect(originHref(MANUAL)).toBeNull();
      expect(originLinkText(MANUAL)).toBe('');
      expect(originHint(MANUAL)).toBe('');
    });

    it('항목을 특정할 수 있으면 앵커까지 붙인다', () => {
      expect(originHref(INSTALLMENT)).toBe('/assets/installments#installment-7');
    });

    it('특정할 수 없으면 화면까지만 보낸다', () => {
      expect(originHref({ origin: 'debt_interest', origin_ref_id: 9 })).toBe('/assets/debts');
    });

    it('참조 id 가 없으면 앵커를 안 붙인다', () => {
      expect(originHref({ origin: 'installment' })).toBe('/assets/installments');
    });

    it('링크 문구와 안내 문구', () => {
      expect(originLinkText(INSTALLMENT)).toBe('할부 화면에서 수정');
      const hint = originHint(INSTALLMENT);
      expect(hint).toContain('할부 등록');
      expect(hint).toContain('할부 화면에서 고칠 수 있어요');
    });

    it('파생 거래 조회 주소', () => {
      expect(derivedEndpoint('installment', 5)).toBe('/api/installments/5/derived');
      expect(derivedEndpoint('revolving', 5)).toBe('/api/revolving/5/derived');
      expect(derivedEndpoint('debt', 5)).toBe('/api/debts/5/derived');
      expect(derivedEndpoint('없는종류', 5)).toBeNull();
    });

    it('앵커 id 규칙', () => {
      expect(anchorId('installment', 7)).toBe('installment-7');
    });
  });

  describe('DerivedBadge', () => {
    it('파생이 아니면 아무것도 안 그린다', () => {
      const { container } = render(<DerivedBadge tx={MANUAL} />);
      expect(container.firstChild).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
    });

    it('표식과 링크를 함께 그린다', () => {
      const { container } = render(<DerivedBadge tx={INSTALLMENT} />);
      
      expect(screen.getByText('할부 3/12회차')).toBeTruthy();
      expect(screen.getByText('할부 화면에서 수정')).toBeTruthy();
      
      const link = screen.getByRole('link');
      expect(link.getAttribute('href')).toBe('/assets/installments#installment-7');
      
      expect(container.querySelector('[data-icon="wallet"]')).toBeTruthy();
    });
  });
});
