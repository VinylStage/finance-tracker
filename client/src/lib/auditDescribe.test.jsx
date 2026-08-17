import { describe, it, expect } from 'vitest'
import { describeAction, fieldName } from './auditFormat'

describe('describeAction', () => {
  it('라벨이 있으면 그것을 쓴다', () => {
    const result = describeAction({ label: '카드 등록', tables: ['transactions'], ops: ['INSERT'] })
    expect(result).toBe('카드 등록')
  })

  it('라벨이 없으면 표와 조작으로 이름을 짓는다', () => {
    let result = describeAction({ tables: ['transactions'], ops: ['INSERT'] })
    expect(result).toBe('거래 추가')

    result = describeAction({ tables: ['categories'], ops: ['UPDATE'] })
    expect(result).toBe('카테고리 수정')
  })

  it('표가 여럿이면 «변경» 으로 묶고 표 이름을 이어 붙인다', () => {
    const result = describeAction({ tables: ['transactions', 'categories'], ops: ['INSERT'] })
    expect(result).toBe('거래·카테고리 변경')
  })

  it('조작이 여럿이면 «변경» 으로 묶는다', () => {
    const result = describeAction({ tables: ['transactions'], ops: ['INSERT', 'DELETE'] })
    expect(result).toBe('거래 변경')
  })

  it('아무 정보도 없으면 «방금 한 작업» 으로 떨어진다', () => {
    let result = describeAction({})
    expect(result).toBe('방금 한 작업')

    result = describeAction()
    expect(result).toBe('방금 한 작업')

    result = describeAction({ tables: [], ops: ['INSERT'] })
    expect(result).toBe('방금 한 작업')
  })

  it('모르는 표·조작 이름은 그대로 쓴다', () => {
    const result = describeAction({ tables: ['weird_table'], ops: ['MERGE'] })
    expect(result).toBe('weird_table MERGE')
  })

  it('필드 이름은 아는 것만 한국어로 바꾼다', () => {
    let result = fieldName('amount')
    expect(result).toBe('금액')

    result = fieldName('unknown_key')
    expect(result).toBe('unknown_key')
  })

  it('어떤 입력에도 빈 문자열을 내지 않는다', () => {
    const testCases = [
      { label: '카드 등록', tables: ['transactions'], ops: ['INSERT'] },
      { tables: ['transactions'], ops: ['INSERT'] },
      { tables: ['categories'], ops: ['UPDATE'] },
      { tables: ['transactions', 'categories'], ops: ['INSERT'] },
      { tables: ['transactions'], ops: ['INSERT', 'DELETE'] },
      {},
      undefined,
      { tables: [], ops: ['INSERT'] },
      { tables: ['weird_table'], ops: ['MERGE'] },
      { label: '카드 등록' },
      { tables: ['transactions'] },
      { ops: ['INSERT'] },
      { tables: ['categories'], ops: ['UPDATE'] },
      { tables: ['transactions'], ops: ['DELETE'] },
      { tables: ['payment_methods'], ops: ['INSERT'] },
      { tables: ['installments'], ops: ['UPDATE'] },
      { tables: ['debts'], ops: ['DELETE'] },
      { tables: ['accounts'], ops: ['INSERT'] },
      { tables: ['card_products'], ops: ['UPDATE'] },
      { tables: ['recurring_rules'], ops: ['DELETE'] },
      { tables: ['transactions'], ops: ['RESTORE'] },
      { tables: ['categories'], ops: ['INSERT'] },
      { tables: ['payment_methods'], ops: ['UPDATE'] },
      { tables: ['installments'], ops: ['INSERT'] },
      { tables: ['debts'], ops: ['UPDATE'] },
      { tables: ['accounts'], ops: ['DELETE'] },
      { tables: ['card_products'], ops: ['RESTORE'] },
      { tables: ['recurring_rules'], ops: ['INSERT'] },
      { tables: ['transactions'], ops: ['MERGE'] },
      { tables: ['categories'], ops: ['MERGE'] },
      { tables: ['payment_methods'], ops: ['MERGE'] },
      { tables: ['installments'], ops: ['MERGE'] },
      { tables: ['debts'], ops: ['MERGE'] },
      { tables: ['accounts'], ops: ['MERGE'] },
      { tables: ['card_products'], ops: ['MERGE'] },
      { tables: ['recurring_rules'], ops: ['MERGE'] },
    ]

    testCases.forEach((testCase) => {
      const result = describeAction(testCase)
      expect(typeof result).toBe('string')
      expect(result).not.toBe('')
    })

    const fieldNames = ['amount', 'merchant', 'memo', 'category_id', 'payment_method_id', 'payment_style', 'status', 'name', 'major_type', 'unknown_key']
    fieldNames.forEach((key) => {
      const result = fieldName(key)
      expect(typeof result).toBe('string')
      expect(result).not.toBe('')
    })
  })
})
