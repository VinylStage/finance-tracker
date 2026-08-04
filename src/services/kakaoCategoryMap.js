// 카카오 로컬 분류를 앱 대분류로 옮기는 표(#275).
//
// 표에 없는 값을 추측해서 분류하지 않는다. 은행처럼 결제 성격이 갈리는 곳을
// 억지로 넣으면 사용자가 나중에 전부 고쳐야 한다 — 모르는 것은 미분류로 둔다.
const MAJOR_TYPES = require('../constants.js').MAJOR_TYPES;

const KAKAO_CATEGORY_MAP = {
  '음식점': '선택지출',
  '카페': '선택지출',
  '문화시설': '선택지출',
  '관광명소': '선택지출',
  '숙박': '선택지출',
  '대형마트': '변동필수',
  '편의점': '변동필수',
  '병원': '변동필수',
  '약국': '변동필수',
  '주유소, 충전소': '변동필수',
  '지하철역': '변동필수',
  '주차장': '변동필수',
  '학원': '고정지출',
  '어린이집, 유치원': '고정지출',
  '학교': '고정지출',
};

function toMajorType(categoryGroupName) {
  if (typeof categoryGroupName !== 'string') return '미분류';
  const trimmed = categoryGroupName.trim();
  if (trimmed === '') return '미분류';
  return KAKAO_CATEGORY_MAP[trimmed] || '미분류';
}

function extractCategoryGroup(kakaoDocument) {
  if (!kakaoDocument || typeof kakaoDocument !== 'object') return null;
  const groupName = kakaoDocument.category_group_name;
  if (typeof groupName !== 'string') return null;
  if (groupName === '') return null;
  return groupName;
}

module.exports = {
  KAKAO_CATEGORY_MAP,
  toMajorType,
  extractCategoryGroup,
};
