const test = require('node:test');
const assert = require('node:assert');
const { toMajorType, extractCategoryGroup } = require('../src/services/kakaoCategoryMap.js');
const { MAJOR_TYPES } = require('../src/constants.js');

test('toMajorType', () => {
  assert.strictEqual(toMajorType('음식점'), '선택지출');
  assert.strictEqual(toMajorType('대형마트'), '변동필수');
  assert.strictEqual(toMajorType('학원'), '고정지출');
  assert.strictEqual(toMajorType('은행'), '미분류');
  assert.strictEqual(toMajorType('처음보는분류'), '미분류');
  assert.strictEqual(toMajorType(''), '미분류');
  assert.strictEqual(toMajorType(null), '미분류');
  assert.strictEqual(toMajorType(undefined), '미분류');
  assert.strictEqual(toMajorType(123), '미분류');
  assert.strictEqual(toMajorType('  음식점  '), '선택지출');
});

test('extractCategoryGroup', () => {
  assert.strictEqual(
    extractCategoryGroup({ category_group_name: '음식점', place_name: '김밥천국' }),
    '음식점'
  );
  assert.strictEqual(extractCategoryGroup({ place_name: '어떤곳' }), null);
  assert.strictEqual(extractCategoryGroup({ category_group_name: '' }), null);
  assert.strictEqual(extractCategoryGroup(null), null);
  assert.strictEqual(extractCategoryGroup(undefined), null);
  assert.strictEqual(extractCategoryGroup('문자열'), null);
});

test('toMajorType values are in MAJOR_TYPES', () => {
  const mapping = require('../src/services/kakaoCategoryMap.js').KAKAO_CATEGORY_MAP;
  for (const majorType of Object.values(mapping)) {
    assert.ok(MAJOR_TYPES.includes(majorType), `Major type "${majorType}" is not in MAJOR_TYPES`);
  }
});

// 매핑 표 전체를 고정한다.
//
// 위 'toMajorType' 테스트는 15개 중 3개만 표본으로 본다. 그러면 '편의점' 을
// 선택지출로 바꿔도 아무도 못 잡는다 — **이 표가 이 모듈의 전부**이고,
// 한 줄이 틀리면 그 분류의 거래가 통째로 다른 곳에 쌓인다.
//
// 표를 바꾸는 것은 판단이다. 바꿀 때 이 테스트가 같이 깨져야 "정말 바꿀
// 것인가" 를 한 번 더 묻게 된다.
test('매핑 표 15개가 전부 고정돼 있다', () => {
  const EXPECTED = {
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

  for (const [group, expected] of Object.entries(EXPECTED)) {
    assert.strictEqual(toMajorType(group), expected, `${group} 매핑이 바뀌었다`);
  }

  // 표에 없는 것을 몰래 더하지 않았는지도 본다. 추측 분류가 늘면
  // 사용자가 나중에 전부 고쳐야 한다.
  const { KAKAO_CATEGORY_MAP } = require('../src/services/kakaoCategoryMap.js');
  assert.deepStrictEqual(
    Object.keys(KAKAO_CATEGORY_MAP).sort(),
    Object.keys(EXPECTED).sort(),
    '매핑 표에 항목이 추가되거나 빠졌다'
  );
});
