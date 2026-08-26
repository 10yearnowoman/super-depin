export const MODES = ['student_reply', 'product_consultation', 'career_script'] as const
export type AgentMode = typeof MODES[number]
export const ACTIONS = ['regenerate', 'warmer', 'professional', 'shorter', 'reanalyze'] as const
export type AgentAction = typeof ACTIONS[number]

export function isMode(value: unknown): value is AgentMode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value)
}

export function isAction(value: unknown): value is AgentAction {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value)
}

export function normalizeResult(input: unknown, mode: AgentMode): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('模型返回的结构化内容不完整。')
  const value = input as Record<string, unknown>
  const analysis = value.internal_analysis
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) throw new Error('模型返回的结构化内容不完整。')
  const a = analysis as Record<string, unknown>
  if (typeof value.recommended_reply !== 'string') throw new Error('模型返回的结构化内容不完整。')
  const stringArray = (item: unknown): string[] => Array.isArray(item) ? item.filter((entry): entry is string => typeof entry === 'string').slice(0, 20) : []
  return {
    task_mode: mode,
    internal_analysis: {
      student_type: typeof a.student_type === 'string' ? a.student_type : '待判断',
      current_stage: typeof a.current_stage === 'string' ? a.current_stage : '信息收集',
      core_need: typeof a.core_need === 'string' ? a.core_need : '需要结合材料进一步判断',
      missing_information: stringArray(a.missing_information),
      risk_flags: stringArray(a.risk_flags),
      reply_goal: typeof a.reply_goal === 'string' ? a.reply_goal : '完成本轮沟通目标',
      manual_review_required: a.manual_review_required === true,
      manual_review_reason: typeof a.manual_review_reason === 'string' ? a.manual_review_reason : '',
      product_fit: typeof a.product_fit === 'string' ? a.product_fit : '',
      quote_status: typeof a.quote_status === 'string' ? a.quote_status : '',
      service_scope: typeof a.service_scope === 'string' ? a.service_scope : '',
      key_limits: stringArray(a.key_limits),
    },
    recommended_reply: value.recommended_reply,
    facts_used: stringArray(value.facts_used),
    uncertain_items: stringArray(value.uncertain_items),
  }
}
