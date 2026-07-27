import React from 'react';
import { readExport, formatSince, EXPORT_KINDS, withObjectParticle } from '../lib/backupStatus';

// 데이터가 어디에 저장되는지 알리는 안내(#198).
//
// 문구는 사실만 쓴다. 이 앱은 로컬 Express 서버 + SQLite 파일로 동작하고,
// 외부 호출은 환율(한국은행·수출입은행)과 주가(KIS, 기본 비활성) 조회뿐이며
// 전부 조회용 GET 이라 거래 내역이 실려 나가지 않는다.
// "외부로 전송되지 않습니다" 라고만 쓰면 외부 호출 자체가 없다는 오해를 주므로
// 예외를 함께 밝힌다 — 신뢰를 주려는 화면에서 사실보다 큰 주장은 역효과다.
export function TrustPanel() {
  return (
    <div className="bg-surface shadow-card rounded-card border border-line p-5 space-y-2">
      <h2 className="text-sm font-semibold text-ink-body">내 데이터는 어디에 있나요</h2>
      <ul className="space-y-1.5 text-xs text-ink-muted">
        <li>
          입력한 거래 내역·카테고리·설정은 <span className="font-medium text-ink">이 기기의 파일</span>(SQLite)에
          저장됩니다. 기본 설정에서는 이 기기에서만 접근할 수 있어요.
        </li>
        <li>
          거래 내역이 외부로 전송되는 경로는 없습니다. 환율과 주가를 불러올 때만 외부 API 를
          호출하고, 그때도 보내는 값은 조회 조건뿐이에요.
        </li>
        <li>
          언제든 CSV·JSON 으로 내보낼 수 있습니다. 아래 백업 항목에서 파일로 저장해 두세요.
        </li>
      </ul>
    </div>
  );
}

// 마지막 내보내기 시각. 값은 이 브라우저의 localStorage 에만 있으므로
// "백업된 시각"이 아니라 "이 브라우저에서 내보낸 시각"이라고 정확히 쓴다.
export function LastExportNote({ kind, now }) {
  const iso = readExport(kind);
  const since = formatSince(iso, now);
  const label = EXPORT_KINDS[kind] || '데이터';

  if (!since) {
    return (
      <p className="text-xs text-ink-faint">
        아직 {withObjectParticle(label)} 내보낸 적이 없어요. 파일로 저장해 두면 기기를 옮길 때 그대로 가져갈 수 있습니다.
      </p>
    );
  }

  return (
    <p className="text-xs text-ink-faint">
      마지막 내보내기 <span className="font-medium text-ink-muted">{since}</span>
      <span className="ml-1">(이 브라우저 기준)</span>
    </p>
  );
}
