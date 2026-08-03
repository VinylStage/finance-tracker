// 파생 거래를 화면에서 어떻게 말할 것인가(#270).
//
// 서버는 이미 origin 으로 파생 거래를 잠갔다(#268). 화면이 그 상태를 설명하지
// 않으면 사용자는 수정 버튼을 눌렀다가 403 을 보고 고장으로 읽는다. 막힌 이유와
// 어디서 고칠 수 있는지를 **누르기 전에** 보여야 한다.
//
// 표시 문자열을 여기 모아 두는 이유는 두 가지다.
//   - `origin`, `origin_ref_id` 같은 내부 용어가 화면에 새는 것을 한곳에서 막는다(#231)
//   - 목록·부채관리 화면·안내 문구가 같은 말을 쓰게 한다

const ORIGIN_SPEC = {
  installment: {
    icon: 'wallet',
    noun: '할부',
    where: '할부 등록',
    screen: '할부',
    path: '/assets/installments',
    anchor: 'installment',
  },
  revolving: {
    icon: 'refresh',
    noun: '리볼빙 수수료',
    where: '리볼빙 기록',
    screen: '리볼빙',
    path: '/assets/revolving',
    anchor: 'revolving',
  },
  debt_interest: {
    icon: 'analytics',
    noun: '대출 이자',
    where: '대출 이자 기록',
    screen: '부채',
    path: '/assets/debts',
    // 거래 행이 들고 있는 것은 이자 기록 id 라 부채 항목을 특정할 수 없다.
    // 화면까지만 보낸다 — 있지도 않은 자리로 보내는 링크보다 낫다.
    anchor: null,
  },
  debt_repayment: {
    icon: 'savings',
    noun: '대출 상환',
    where: '대출 상환 기록',
    screen: '부채',
    path: '/assets/debts',
    // 이자와 같은 이유. 상환 기록 id 라 부채를 특정할 수 없다.
    anchor: null,
  },
};

export function isDerived(tx) {
  const origin = (tx && tx.origin) || 'manual';
  return origin !== 'manual';
}

function specOf(tx) {
  return ORIGIN_SPEC[(tx && tx.origin) || 'manual'] || null;
}

// 목록에 붙는 표식. 색만으로 구분하지 않으려면 아이콘과 함께 이 텍스트가 있어야
// 한다(#191 에서 세운 기준, WCAG 1.4.1).
//
// 할부는 몇 번째 회차인지가 핵심 정보다. 회차 번호가 없으면(옛 데이터) 종류만 말한다.
export function originLabel(tx) {
  const spec = specOf(tx);
  if (!spec) return '';
  if (tx.origin === 'installment' && tx.origin_seq && tx.origin_seq_total) {
    return `${spec.noun} ${tx.origin_seq}/${tx.origin_seq_total}회차`;
  }
  return spec.noun;
}

export function originIcon(tx) {
  const spec = specOf(tx);
  return spec ? spec.icon : null;
}

// "부채관리에서 수정" 링크의 목적지. 항목을 특정할 수 있으면 그 자리까지 보낸다.
export function originHref(tx) {
  const spec = specOf(tx);
  if (!spec) return null;
  if (spec.anchor && tx.origin_ref_id) {
    return `${spec.path}#${spec.anchor}-${tx.origin_ref_id}`;
  }
  return spec.path;
}

export function originLinkText(tx) {
  const spec = specOf(tx);
  return spec ? `${spec.screen} 화면에서 수정` : '';
}

// 왜 여기서 못 고치는지. 통보형("수정할 수 없습니다")이 아니라 무엇을 할 수
// 있는지로 끝낸다 — docs/VOICE_TONE_GUIDE.md 원칙.
export function originHint(tx) {
  const spec = specOf(tx);
  if (!spec) return '';
  return `이 내역은 ${spec.where}에서 자동으로 만들어졌어요. ${spec.screen} 화면에서 고칠 수 있어요.`;
}

// 부채관리 화면이 자기 항목의 파생 거래를 부를 주소.
export function derivedEndpoint(kind, id) {
  if (kind === 'installment') return `/api/installments/${id}/derived`;
  if (kind === 'revolving') return `/api/revolving/${id}/derived`;
  if (kind === 'debt') return `/api/debts/${id}/derived`;
  return null;
}

// 목록의 항목에 붙일 앵커 id. 거래내역에서 넘어온 링크가 찾는 자리다.
export function anchorId(kind, id) {
  return `${kind}-${id}`;
}
