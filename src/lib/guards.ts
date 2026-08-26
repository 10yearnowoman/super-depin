import type { Result, TaskMode } from '../types'

const forbidden = [
  '保证入职', '保证拿 Offer', '保证拿Offer', '保证录取', '至少有一家一定通过',
  '交钱后直接入职', '无限次免费匹配', '供应商结算价', '供应商联系人',
  '内部保留名额', '远程 PTA 有企业实习证明', '人事实习就是 HR 岗位',
]

export function hasForbiddenClaim(text: string): boolean {
  return forbidden.some((term) => text.includes(term))
}

export function isCareerScriptClean(text: string): boolean {
  const normalized = text.toLowerCase()
  const forbiddenTerms = ['24800', '26800', '32800', '55800', '299 元', '购买', '签约', '促签', '产品', '报价', '付费', '销售']
  return !forbiddenTerms.some((term) => normalized.includes(term))
}

export function modeLabel(mode: TaskMode): string {
  return ({
    student_reply: '回复学生',
    product_consultation: '产品咨询',
    career_script: '职业规划逐字稿',
  })[mode]
}
