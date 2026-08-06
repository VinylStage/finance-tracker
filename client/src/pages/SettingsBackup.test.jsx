import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 설정 화면의 백업/복원 두 절 — '설정 백업 / 복원' 과 '거래내역 백업 / 복원'.
//
// 절 단위로 파일을 나눈다. 이 둘은 파일 업로드와 덮어쓰기라는 같은 모양을
// 공유하고, 둘 다 **되돌릴 수 없는 경로**를 갖고 있어 한 파일에 뒀다.
//
// 확인 토큰이 핵심이다. 화면의 확인 대화상자와 별개로 서버가 따로 요구하는
// 값이라, 여기서 빠지면 서버 방어선이 화면 코드에 의해 무력화된다. 반대로
// 파괴적이지 않은 경로(추가)에는 붙으면 안 된다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
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

const settingsBackup = () => sectionBy('설정 백업 / 복원');
const txBackup = () => sectionBy('거래내역 백업 / 복원');

const dialog = () => screen.getByRole('dialog');

function jsonFile(obj, name = 'backup.json') {
  return new File([JSON.stringify(obj)], name, { type: 'application/json' });
}

// 파일 입력은 라벨에 가려 숨겨져 있다(className="hidden"). 절 안에서 직접 찾는다.
function fileInputIn(sec) {
  return sec.getByText(/가져오기|불러오기/).closest('label').querySelector('input[type="file"]');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('설정 복원', () => {
  const PAYLOAD = {
    categories: [{ major_type: '선택지출', name: '커피', monthly_budget: 0 }],
    payment_methods: [{ name: '하나카드', type: '신용' }],
    settings: { initial_balance: 100000, monthly_income: 3000000 },
  };

  const upload = async (payload = PAYLOAD) => {
    renderSettings();
    const sec = await settingsBackup();
    await userEvent.upload(fileInputIn(sec), jsonFile(payload));
    return sec;
  };

  it('덮어쓴다는 것을 먼저 알리고 확인을 받는다', async () => {
    await upload();

    expect(within(dialog()).getByText(/현재 카테고리·결제수단·설정값을 파일 내용으로 덮어씁니다/)).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: '복원' })).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('취소하면 보내지 않는다', async () => {
    await upload();
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post).not.toHaveBeenCalled();
  });

  it('확인하면 파일 내용에 확인 토큰을 얹어 보낸다', async () => {
    post.mockResolvedValue({ ok: true });
    await upload();
    await userEvent.click(within(dialog()).getByRole('button', { name: '복원' }));

    // 토큰이 빠지면 서버의 파괴적-동작 방어선이 화면 코드에 의해 무력화된다.
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/export/settings/restore', {
      ...PAYLOAD, confirm: 'OVERWRITE_SETTINGS',
    }));
  });

  it('성공하면 복원됐다고 알린다', async () => {
    post.mockResolvedValue({ ok: true });
    const sec = await upload();
    await userEvent.click(within(dialog()).getByRole('button', { name: '복원' }));

    expect(await sec.findByText('설정이 복원되었습니다.')).toBeTruthy();
  });

  it('서버가 ok 가 아니면 사유를 그대로 보여준다', async () => {
    post.mockResolvedValue({ ok: false, error: '형식이 맞지 않습니다' });
    const sec = await upload();
    await userEvent.click(within(dialog()).getByRole('button', { name: '복원' }));

    expect(await sec.findByText('복원 실패: 형식이 맞지 않습니다')).toBeTruthy();
  });

  it('JSON 이 깨져 있으면 확인 뒤에 알린다', async () => {
    renderSettings();
    const sec = await settingsBackup();
    const broken = new File(['{ 이건 JSON 이 아니다'], 'broken.json', { type: 'application/json' });

    await userEvent.upload(fileInputIn(sec), broken);
    await userEvent.click(within(dialog()).getByRole('button', { name: '복원' }));

    // 파싱 실패가 조용히 넘어가면 사용자는 복원이 됐다고 믿는다.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(post).not.toHaveBeenCalled();
  });

  it('요청이 실패하면 사유를 알린다', async () => {
    post.mockRejectedValue(new Error('서버에 연결할 수 없습니다'));
    await upload();
    await userEvent.click(within(dialog()).getByRole('button', { name: '복원' }));

    expect(await screen.findByText('서버에 연결할 수 없습니다')).toBeTruthy();
  });
});

describe('거래내역 불러오기 — 미리보기', () => {
  const tx = (i) => ({ date: `2026-01-${String(i).padStart(2, '0')}`, merchant: `가맹점${i}`, amount: i * 1000 });

  const upload = async (payload) => {
    renderSettings();
    const sec = await txBackup();
    await userEvent.upload(fileInputIn(sec), jsonFile(payload));
    return sec;
  };

  it('transactions 배열이 없으면 미리보기를 열지 않는다', async () => {
    const sec = await upload({ categories: [] });

    expect(await sec.findByText(/transactions 배열이 필요합니다/)).toBeTruthy();
    expect(sec.queryByText('미리보기')).toBeNull();
  });

  it('transactions 가 배열이 아니어도 막는다', async () => {
    const sec = await upload({ transactions: '전부' });

    // 타입만 다르고 키는 있는 파일이 통과하면, 아래 slice 에서 화면이 터진다.
    expect(await sec.findByText(/transactions 배열이 필요합니다/)).toBeTruthy();
  });

  it('앞의 다섯 건만 보여주되 총 건수는 전체를 센다', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => tx(i + 1));
    const sec = await upload({ transactions: rows });

    await sec.findByText('미리보기');
    expect(sec.getByText('총 12건')).toBeTruthy();
    expect(sec.getByText('가맹점5')).toBeTruthy();
    // 여섯 번째부터는 안 보인다. 다 그리면 만 건짜리 파일에서 화면이 멈춘다.
    expect(sec.queryByText('가맹점6')).toBeNull();
  });

  it('가맹점과 금액이 비어 있으면 - 로 채운다', async () => {
    const sec = await upload({ transactions: [{ date: '2026-01-01' }] });

    await sec.findByText('미리보기');
    // undefined.toLocaleString() 이 나면 미리보기 전체가 터진다.
    expect(sec.getAllByText('-')).toHaveLength(2);
  });

  it('금액에 자릿수 구분을 넣는다', async () => {
    const sec = await upload({ transactions: [{ date: '2026-01-01', merchant: 'A', amount: 1234567 }] });

    await sec.findByText('미리보기');
    expect(sec.getByText('1,234,567')).toBeTruthy();
  });

  it('JSON 이 깨져 있으면 사유를 보여준다', async () => {
    renderSettings();
    const sec = await txBackup();
    const broken = new File(['{{{'], 'broken.json', { type: 'application/json' });

    await userEvent.upload(fileInputIn(sec), broken);

    expect(await sec.findByText(/^오류: /)).toBeTruthy();
    expect(sec.queryByText('미리보기')).toBeNull();
  });
});

describe('거래내역 불러오기 — 추가와 덮어쓰기', () => {
  const ROWS = [{ date: '2026-01-01', merchant: 'A', amount: 1000 }];

  const preview = async () => {
    renderSettings();
    const sec = await txBackup();
    await userEvent.upload(fileInputIn(sec), jsonFile({ transactions: ROWS }));
    await sec.findByText('미리보기');
    return sec;
  };

  it('추가는 확인 없이 바로 보낸다', async () => {
    post.mockResolvedValue({ ok: true, imported: 1, skipped: 0 });
    const sec = await preview();

    await userEvent.click(sec.getByRole('button', { name: '새 데이터 추가' }));

    // 추가는 잃는 게 없다. 여기에 확인을 붙이면 매번 묻는 화면이 된다.
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/data/import', {
      mode: 'append', transactions: ROWS,
    }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('추가에는 확인 토큰을 붙이지 않는다', async () => {
    post.mockResolvedValue({ ok: true, imported: 1, skipped: 0 });
    const sec = await preview();

    await userEvent.click(sec.getByRole('button', { name: '새 데이터 추가' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    // 파괴적이지 않은 경로에 토큰이 붙으면 토큰의 뜻이 흐려진다.
    expect(post.mock.calls[0][1].confirm).toBeUndefined();
  });

  it('덮어쓰기는 먼저 확인을 받는다', async () => {
    const sec = await preview();

    await userEvent.click(sec.getByRole('button', { name: '덮어쓰기' }));

    expect(within(dialog()).getByText(/기존 거래내역이 모두 삭제됩니다/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('덮어쓰기를 취소하면 미리보기를 남긴 채 보내지 않는다', async () => {
    const sec = await preview();

    await userEvent.click(sec.getByRole('button', { name: '덮어쓰기' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post).not.toHaveBeenCalled();
    // 미리보기가 사라지면 파일을 다시 골라야 한다.
    expect(sec.getByText('미리보기')).toBeTruthy();
  });

  it('덮어쓰기는 확인 토큰을 실어 보낸다', async () => {
    post.mockResolvedValue({ ok: true, imported: 1, skipped: 0 });
    const sec = await preview();

    await userEvent.click(sec.getByRole('button', { name: '덮어쓰기' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/data/import', {
      mode: 'overwrite', transactions: ROWS, confirm: 'DELETE_ALL',
    }));
  });

  it('저장 건수와 스킵 건수를 알린다', async () => {
    post.mockResolvedValue({ ok: true, imported: 8, skipped: 3 });
    const sec = await preview();

    await userEvent.click(sec.getByRole('button', { name: '새 데이터 추가' }));

    expect(await sec.findByText('8건 저장됨 (3건 스킵)')).toBeTruthy();
  });

  it('실행하면 미리보기를 닫는다', async () => {
    post.mockResolvedValue({ ok: true, imported: 1, skipped: 0 });
    const sec = await preview();

    await userEvent.click(sec.getByRole('button', { name: '새 데이터 추가' }));

    // 남아 있으면 같은 파일을 두 번 넣게 된다.
    await waitFor(() => expect(sec.queryByText('미리보기')).toBeNull());
  });

  it('서버가 ok 가 아니면 사유를 보여준다', async () => {
    post.mockResolvedValue({ ok: false, error: '확인 토큰이 올바르지 않습니다' });
    const sec = await preview();

    await userEvent.click(sec.getByRole('button', { name: '새 데이터 추가' }));

    expect(await sec.findByText('오류: 확인 토큰이 올바르지 않습니다')).toBeTruthy();
  });

  it('요청이 실패해도 사유를 보여주고 미리보기를 닫는다', async () => {
    post.mockRejectedValue(new Error('서버에 연결할 수 없습니다'));
    const sec = await preview();

    await userEvent.click(sec.getByRole('button', { name: '새 데이터 추가' }));

    expect(await sec.findByText('오류: 서버에 연결할 수 없습니다')).toBeTruthy();
    expect(sec.queryByText('미리보기')).toBeNull();
  });
});
