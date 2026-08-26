import { describe, expect, it } from 'vitest'
import { hasForbiddenClaim, isCareerScriptClean, modeLabel } from './guards'

describe('runtime output guards', () => {
  it('flags explicit result guarantees', () => {
    expect(hasForbiddenClaim('保证入职')).toBe(true)
    expect(hasForbiddenClaim('最终由企业审核决定')).toBe(false)
  })
  it('keeps career scripts free of product sales terms', () => {
    expect(isCareerScriptClean('我们先总结方向，再布置一周行动任务。')).toBe(true)
    expect(isCareerScriptClean('您可以购买 299 元服务。')).toBe(false)
  })
  it('maps task mode labels', () => {
    expect(modeLabel('student_reply')).toBe('回复学生')
    expect(modeLabel('product_consultation')).toBe('产品咨询')
  })
})
