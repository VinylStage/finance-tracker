import { describe, it, expect } from 'vitest'
import { diffFields, labelForField } from './auditFormat'

describe('diffFields', () => {
  it('A-1. 바뀐 필드만 나온다', () => {
    const before = JSON.stringify({ a: 1, b: 2 })
    const after = JSON.stringify({ a: 1, b: 3 })
    const result = diffFields(before, after)
    expect(result).toEqual([{ key: 'b', before: 2, after: 3 }])
  })

  it('A-2. 같은 값인 필드는 빠진다', () => {
    const before = JSON.stringify({ a: 1, b: 2 })
    const after = JSON.stringify({ a: 1, b: 2 })
    const result = diffFields(before, after)
    expect(result).toEqual([])
  })

  it('A-3. before 가 null 이면 전부 생성으로 나온다', () => {
    const before = null
    const after = JSON.stringify({ a: 1, b: 2 })
    const result = diffFields(before, after)
    expect(result).toEqual([
      { key: 'a', before: null, after: 1 },
      { key: 'b', before: null, after: 2 }
    ])
  })

  it('A-4. after 가 null 이면 전부 삭제로 나온다', () => {
    const before = JSON.stringify({ a: 1, b: 2 })
    const after = null
    const result = diffFields(before, after)
    expect(result).toEqual([
      { key: 'a', before: 1, after: null },
      { key: 'b', before: 2, after: null }
    ])
  })

  it('A-5. 둘 다 null 이면 빈 배열', () => {
    const result = diffFields(null, null)
    expect(result).toEqual([])
  })

  it('A-6. 잘못된 JSON 이면 빈 배열', () => {
    const before = '{ invalid json'
    const after = JSON.stringify({ a: 1 })
    const result = diffFields(before, after)
    expect(result).toEqual([])
  })

  it('A-7. key 가 알파벳 순으로 정렬된다', () => {
    // 값이 같은 필드는 제외되므로, 정렬 확인에는 둘 다 바뀐 필드를 쓴다.
    const before = JSON.stringify({ z: 1, a: 2 })
    const after = JSON.stringify({ z: 9, a: 3 })
    const result = diffFields(before, after)
    expect(result.map((r) => r.key)).toEqual(['a', 'z'])
  })
})

describe('labelForField', () => {
  it('B-1. category_id 를 카테고리 이름으로 바꾼다', () => {
    const lookups = { categories: { 1: '식비', 2: '교통' } }
    const result = labelForField('category_id', 1, lookups)
    expect(result).toBe('식비')
  })

  it('B-2. payment_method_id 를 결제수단 이름으로 바꾼다', () => {
    const lookups = { paymentMethods: { 1: '카드', 2: '현금' } }
    const result = labelForField('payment_method_id', 1, lookups)
    expect(result).toBe('카드')
  })

  it('B-3. lookups 에 없는 id 는 값 그대로 보여준다', () => {
    const lookups = { categories: { 1: '식비' } }
    const result = labelForField('category_id', 2, lookups)
    expect(result).toBe('2')
  })

  it('B-4. null 은 "(없음)" 이다', () => {
    const result = labelForField('category_id', null)
    expect(result).toBe('(없음)')
  })

  it('B-5. 일반 필드는 값 그대로다', () => {
    const result = labelForField('amount', 10000)
    expect(result).toBe('10000')
  })

  it('B-6. lookups 가 없어도 동작한다', () => {
    const result = labelForField('category_id', 1)
    expect(result).toBe('1')
  })
})
