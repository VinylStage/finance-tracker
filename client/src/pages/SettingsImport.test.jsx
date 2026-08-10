import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 설정 화면의 임포트 두 절 — '카드사 엑셀 임포트' 와 '신한카드 CSV 임포트'.
//
// 절 단위로 파일을 나눈다. 이 둘은 **파일 선택 → 미리보기 → 임포트** 라는 같은
// 2단계를 공유하므로 한 파일에 뒀다. 함께 봐야 "미리보기 없이는 임포트하지
// 않는다" 는 규칙이 두 절에 같은 모양으로 있다는 게 드러난다.
//
// 파싱은 서버가 한다(test/ 의 cardImport·csvImport 테스트). 여기서는 화면이
// 무엇을 보내고, 받은 결과를 어떻게 세어 보여주는지만 잡는다.

const { get, post, put, del, raw } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), raw: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del, raw },
  ApiError: class ApiError extends Error {},
}));

function mockApi() {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/categories')) return Promise.resolve([]);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    if (url.startsWith('/api/settings')) return Promise.resolve({ initial_balance: 0, monthly_income: 0 });
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve([]);
    if (url.startsWith('/api/accounts')) return Promise.resolve({ data: [] });
    return Promise.resolve([]);
  });
}

const renderSettings = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

const sectionBy = async (name) => {
  const h = await screen.findByRole('heading', { name });
  return within(h.closest('section'));
};

const cardSection = () => sectionBy('카드사 엑셀 임포트');
const csvSection = () => sectionBy('신한카드 CSV 임포트');

function fileInputIn(sec, labelText) {
  return sec.getByText(labelText).closest('label').querySelector('input[type="file"]');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('카드사 엑셀 임포트 — 미리보기', () => {
  const xlsx = (name) => new File(['bin'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const PREVIEW = {
    totals: { files: 2, succeeded: 1, failed: 1, count: 12, skipped: 3 },
    results: [
      { ok: true, filename: '현대카드.xlsx', cardCompanyLabel: '현대카드', count: 12, skipped: 3 },
      { ok: false, filename: '알수없음.xlsx', error: '카드사를 알아볼 수 없습니다' },
    ],
  };

  const upload = async (files = [xlsx('현대카드.xlsx'), xlsx('알수없음.xlsx')]) => {
    renderSettings();
    const sec = await cardSection();
    await userEvent.upload(fileInputIn(sec, '파일 선택 (여러 개 가능)'), files);
    return sec;
  };

  it('고른 파일들을 한 번에 미리보기로 보낸다', async () => {
    raw.mockResolvedValue(PREVIEW);
    await upload();

    await waitFor(() => expect(raw).toHaveBeenCalledWith('/api/card-import?preview=true',
      expect.objectContaining({ method: 'POST' })));
    const body = raw.mock.calls[0][1].body;
    // FormData 로 보내야 한다. JSON 으로 바꾸면 서버의 multer 가 못 받는다.
    expect(body).toBeInstanceOf(FormData);
    expect(body.getAll('files')).toHaveLength(2);
  });

  it('파일별 성공·실패를 나눠 보여준다', async () => {
    raw.mockResolvedValue(PREVIEW);
    const sec = await upload();

    expect(await sec.findByText('파일 2개 · 성공 1 / 실패 1')).toBeTruthy();
    expect(sec.getByText('현대카드.xlsx')).toBeTruthy();
    // 실패한 파일은 사유가 붙어야 한다. 개수만 세면 무엇이 왜 안 됐는지 모른다.
    expect(sec.getByText(/카드사를 알아볼 수 없습니다/)).toBeTruthy();
  });

  it('신규 건수에 자릿수 구분을 넣어 버튼에 적는다', async () => {
    raw.mockResolvedValue({ ...PREVIEW, totals: { ...PREVIEW.totals, count: 12345 } });
    const sec = await upload();

    expect(await sec.findByRole('button', { name: '신규 12,345건 임포트' })).toBeTruthy();
  });

  it('신규가 0 건이면 임포트 버튼을 잠근다', async () => {
    raw.mockResolvedValue({
      totals: { files: 1, succeeded: 1, failed: 0, count: 0, skipped: 5 },
      results: [{ ok: true, filename: 'a.xlsx', cardCompanyLabel: '하나카드', count: 0, skipped: 5 }],
    });
    const sec = await upload([xlsx('a.xlsx')]);

    // 전부 중복인 파일로 임포트를 누르면 아무 일도 없는데 눌리기만 한다.
    const btn = await sec.findByRole('button', { name: '신규 0건 임포트' });
    expect(btn.disabled).toBe(true);
  });

  it('미리보기가 실패하면 사유만 보여주고 임포트 단계로 넘어가지 않는다', async () => {
    raw.mockRejectedValue(new Error('파일이 너무 큽니다'));
    const sec = await upload();

    expect(await sec.findByText('오류: 파일이 너무 큽니다')).toBeTruthy();
    expect(sec.queryByRole('button', { name: /임포트$/ })).toBeNull();
  });

  it('취소하면 미리보기를 접는다', async () => {
    raw.mockResolvedValue(PREVIEW);
    const sec = await upload();
    await sec.findByText('파일 2개 · 성공 1 / 실패 1');

    await userEvent.click(sec.getByRole('button', { name: '취소' }));

    expect(sec.queryByText('파일 2개 · 성공 1 / 실패 1')).toBeNull();
  });
});

describe('카드사 엑셀 임포트 — 실행', () => {
  const xlsx = (name) => new File(['bin'], name, { type: 'application/vnd.ms-excel' });
  const PREVIEW = {
    totals: { files: 1, succeeded: 1, failed: 0, count: 7, skipped: 2 },
    results: [{ ok: true, filename: 'a.xlsx', cardCompanyLabel: '삼성카드', count: 7, skipped: 2 }],
  };

  const arrive = async () => {
    raw.mockResolvedValue(PREVIEW);
    renderSettings();
    const sec = await cardSection();
    await userEvent.upload(fileInputIn(sec, '파일 선택 (여러 개 가능)'), [xlsx('a.xlsx')]);
    await sec.findByRole('button', { name: '신규 7건 임포트' });
    return sec;
  };

  it('미리보기 때와 같은 파일을 preview 없이 다시 보낸다', async () => {
    const sec = await arrive();
    raw.mockResolvedValue({ totals: { imported: 7, skipped: 2, failed: 0 } });

    await userEvent.click(sec.getByRole('button', { name: '신규 7건 임포트' }));

    // 주소에 preview 가 남으면 눌러도 아무것도 저장되지 않는다.
    await waitFor(() => expect(raw).toHaveBeenLastCalledWith('/api/card-import',
      expect.objectContaining({ method: 'POST' })));
  });

  it('저장·스킵 건수를 알린다', async () => {
    const sec = await arrive();
    raw.mockResolvedValue({ totals: { imported: 1234, skipped: 56 } });

    await userEvent.click(sec.getByRole('button', { name: '신규 7건 임포트' }));

    expect(await sec.findByText('1,234건 임포트 완료 (중복 스킵 56건)')).toBeTruthy();
  });

  it('실패한 파일이 있으면 개수를 덧붙인다', async () => {
    const sec = await arrive();
    raw.mockResolvedValue({ totals: { imported: 3, skipped: 0, failed: 2 } });

    await userEvent.click(sec.getByRole('button', { name: '신규 7건 임포트' }));

    expect(await sec.findByText('3건 임포트 완료 (중복 스킵 0건, 실패 파일 2개)')).toBeTruthy();
  });

  it('실패 파일이 없으면 그 문구를 붙이지 않는다', async () => {
    const sec = await arrive();
    raw.mockResolvedValue({ totals: { imported: 3, skipped: 0, failed: 0 } });

    await userEvent.click(sec.getByRole('button', { name: '신규 7건 임포트' }));

    expect(await sec.findByText('3건 임포트 완료 (중복 스킵 0건)')).toBeTruthy();
  });

  it('성공하면 미리보기를 접어 두 번 넣지 못하게 한다', async () => {
    const sec = await arrive();
    raw.mockResolvedValue({ totals: { imported: 7, skipped: 0 } });

    await userEvent.click(sec.getByRole('button', { name: '신규 7건 임포트' }));

    await waitFor(() => expect(sec.queryByRole('button', { name: '신규 7건 임포트' })).toBeNull());
  });

  it('실패하면 사유를 보여준다', async () => {
    const sec = await arrive();
    raw.mockRejectedValue(new Error('저장 중 오류가 났습니다'));

    await userEvent.click(sec.getByRole('button', { name: '신규 7건 임포트' }));

    expect(await sec.findByText('오류: 저장 중 오류가 났습니다')).toBeTruthy();
  });
});

describe('신한카드 CSV 임포트', () => {
  const csv = (text, name = 'shinhan.csv') => new File([text], name, { type: 'text/csv' });
  const TEXT = '거래일자,가맹점,금액\n2026-01-02,커피,4500\n';

  const upload = async (file = csv(TEXT)) => {
    renderSettings();
    const sec = await csvSection();
    await userEvent.upload(fileInputIn(sec, '파일 선택'), file);
    return sec;
  };

  it('파일 내용을 읽어 신한카드로 미리보기를 요청한다', async () => {
    post.mockResolvedValue({ count: 1, skipped: 0 });
    await upload();

    // 엑셀 절과 달리 여기는 본문을 텍스트로 보낸다. FormData 로 바꾸면 서버가 못 받는다.
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/csv-import?preview=true', {
      cardCompany: 'shinhan', csvText: TEXT,
    }));
  });

  it('신규·중복 건수를 자릿수 구분해 보여준다', async () => {
    post.mockResolvedValue({ count: 1234, skipped: 56 });
    const sec = await upload();

    expect(await sec.findByText(/신규 1,234건 · 중복 56건/)).toBeTruthy();
  });

  it('형식 오류가 있을 때만 그 건수를 덧붙인다', async () => {
    post.mockResolvedValue({ count: 3, skipped: 0, invalid: 2 });
    const sec = await upload();

    expect(await sec.findByText(/형식 오류\(제외\) 2건/)).toBeTruthy();
  });

  it('형식 오류가 없으면 그 문구를 붙이지 않는다', async () => {
    post.mockResolvedValue({ count: 3, skipped: 0, invalid: 0 });
    const sec = await upload();

    await sec.findByText(/신규 3건 · 중복 0건/);
    expect(sec.queryByText(/형식 오류/)).toBeNull();
  });

  it('고른 파일 이름을 보여준다', async () => {
    post.mockResolvedValue({ count: 1, skipped: 0 });
    const sec = await upload(csv(TEXT, '2026년1월.csv'));

    // 여러 번 나눠 올릴 때 어느 파일을 보고 있는지 알아야 한다.
    expect(await sec.findByText('2026년1월.csv')).toBeTruthy();
  });

  it('신규가 0 건이면 임포트 버튼을 잠근다', async () => {
    post.mockResolvedValue({ count: 0, skipped: 9 });
    const sec = await upload();

    const btn = await sec.findByRole('button', { name: '신규 0건 임포트' });
    expect(btn.disabled).toBe(true);
  });

  it('임포트는 preview 없는 주소로 같은 본문을 보낸다', async () => {
    post.mockResolvedValue({ count: 2, skipped: 0 });
    const sec = await upload();
    await sec.findByRole('button', { name: '신규 2건 임포트' });

    post.mockResolvedValue({ imported: 2, skipped: 0 });
    await userEvent.click(sec.getByRole('button', { name: '신규 2건 임포트' }));

    await waitFor(() => expect(post).toHaveBeenLastCalledWith('/api/csv-import', {
      cardCompany: 'shinhan', csvText: TEXT,
    }));
  });

  it('저장 결과를 알리고 미리보기를 접는다', async () => {
    post.mockResolvedValue({ count: 2, skipped: 0 });
    const sec = await upload();
    await sec.findByRole('button', { name: '신규 2건 임포트' });

    post.mockResolvedValue({ imported: 1234, skipped: 56, invalid: 7 });
    await userEvent.click(sec.getByRole('button', { name: '신규 2건 임포트' }));

    expect(await sec.findByText('1,234건 임포트 완료 (중복 스킵 56건, 형식 오류 7건 제외)')).toBeTruthy();
    expect(sec.queryByRole('button', { name: '신규 2건 임포트' })).toBeNull();
  });

  it('형식 오류가 없으면 결과 문구에도 붙이지 않는다', async () => {
    post.mockResolvedValue({ count: 2, skipped: 0 });
    const sec = await upload();
    await sec.findByRole('button', { name: '신규 2건 임포트' });

    post.mockResolvedValue({ imported: 2, skipped: 0, invalid: 0 });
    await userEvent.click(sec.getByRole('button', { name: '신규 2건 임포트' }));

    // 미리보기 쪽만 잠그면 결과 문구에 '형식 오류 0건 제외' 가 붙는 변경을 못 잡는다.
    expect(await sec.findByText('2건 임포트 완료 (중복 스킵 0건)')).toBeTruthy();
  });

  it('미리보기가 실패하면 사유만 보여준다', async () => {
    post.mockRejectedValue(new Error('CSV 를 읽을 수 없습니다'));
    const sec = await upload();

    expect(await sec.findByText('오류: CSV 를 읽을 수 없습니다')).toBeTruthy();
    expect(sec.queryByRole('button', { name: /임포트$/ })).toBeNull();
  });

  it('취소하면 미리보기를 접는다', async () => {
    post.mockResolvedValue({ count: 2, skipped: 0 });
    const sec = await upload();
    await sec.findByRole('button', { name: '신규 2건 임포트' });

    await userEvent.click(sec.getByRole('button', { name: '취소' }));

    expect(sec.queryByRole('button', { name: '신규 2건 임포트' })).toBeNull();
    expect(sec.queryByText('shinhan.csv')).toBeNull();
    // 취소 핸들러는 csvText·fileName 도 함께 비우지만, 그 둘은 미리보기 안에서만
    // 쓰여서 여기서 잠기지 않는다 — 비우지 않아도 이 파일은 통과한다.
    // 다음 파일 선택이 어차피 덮어쓰므로 지금은 눈에 띄는 증상이 없다.
  });
});
