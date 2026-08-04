import React, { useState } from 'react';
import { api } from '../lib/api';
import { formatWon, accountStatus, unpaidSummary } from '../lib/balanceView';
import { useLoader } from '../hooks/useLoader';
import LoadError from '../components/LoadError';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';

// 통장 잔액 화면(#291).
//
// 카드 미결제액을 잔액과 나란히 두고 **합치지 않는다.** 통장에 있는 돈과 나갈
// 예정인 돈을 한 숫자로 합치면 사용자가 어느 쪽을 보는지 알 수 없다.
//
// 계산은 전부 서버가 한다(accountBalance.js). 이 화면은 받은 값을 배치만 하고,
// 합계조차 화면에서 다시 만들지 않는 편이 원칙적으로는 맞다 — 지금은 계좌
// 목록의 단순 합이라 여기서 더하지만, 규칙이 생기면 서버로 옮긴다.

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  
  const { loading, error, reload } = useLoader(async () => {
    const response = await api.get('/api/accounts/balances');
    setAccounts(response.data || []);
  }, []);

  const totalBalance = accounts.reduce((sum, account) => sum + (account.balance || 0), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">통장 잔액</h1>
      
      {loading ? (
        <div className="text-caption text-center py-10">로딩 중...</div>
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<Icon name="account" size={32} />}
          title="등록된 계좌가 없어요"
          description="설정에서 계좌를 먼저 등록해 주세요."
        />
      ) : (
        <>
          <div className="bg-surface shadow-card rounded-card border border-line p-4">
            <p className="text-sm text-caption">총 잔액</p>
            <p className="text-xl font-semibold text-ink mt-1">{formatWon(totalBalance)}</p>
          </div>
          
          <div className="bg-surface shadow-card rounded-card border border-line overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-page">
                <tr className="border-b border-line">
                  <th className="text-left px-4 py-3 text-caption font-medium">계좌명</th>
                  <th className="text-right px-4 py-3 text-caption font-medium">잔액</th>
                  <th className="text-right px-4 py-3 text-caption font-medium">카드 미결제액</th>
                  <th className="text-left px-4 py-3 text-caption font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const status = accountStatus(account);
                  const unpaidSummaryData = unpaidSummary(account.card_unpaid);
                  
                  return (
                    <tr key={account.id} className="border-b border-line-faint hover:bg-surface-page transition-colors">
                      <td className="px-4 py-3 text-ink">{account.name}</td>
                      <td className="px-4 py-3 text-right text-body tabular-nums">{formatWon(account.balance)}</td>
                      <td className="px-4 py-3 text-right text-body tabular-nums">
                        {/* 0 이 아니면 보여준다. **음수도 보여준다** — 정산이
                            사용 기록보다 많다는 뜻이고 데이터가 어긋났다는
                            신호다. 감추면 사용자가 알 방법이 없다. */}
                        {unpaidSummaryData.total !== 0 ? formatWon(unpaidSummaryData.total) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {status === 'unknown-billing' && (
                            <span className="text-xs text-loss-text">
                              청구월을 모르는 거래 {unpaidSummaryData.unknownCount}건이 있어요.
                            </span>
                          )}
                          {status === 'no-activity' && (
                            <span className="text-xs text-caption">아직 거래가 없어요.</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
