import type { PagesFunction } from '../types'
import { requirePreview, rateLimit } from '../_lib/access'
import { generateAgent } from '../_lib/agent-engine'
import { json, methodNotAllowed, options, originError, readJson, requestId, safeError, sameOrigin, textField } from '../_lib/http'
import { knowledgeFor } from '../_lib/runtime'
import { isAction, isMode } from '../_lib/schema'

const MAX_BODY_BYTES = 1_000_000

function cleanForm(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求格式不正确。')
  const form = value as Record<string, unknown>
  return {
    studentMessage: textField(form.studentMessage, 20_000, '学生原话'),
    previousChat: textField(form.previousChat, 30_000, '前文聊天'),
    background: textField(form.background, 20_000, '学生背景'),
    teacherNotes: textField(form.teacherNotes, 20_000, '老师备注'),
    product: textField(form.product, 200, '产品'),
    firstInquiry: form.firstInquiry === true,
    explicitPriceFollowup: form.explicitPriceFollowup === true,
    nextStep: textField(form.nextStep, 2_000, '下一步'),
    basicSituation: textField(form.basicSituation, 20_000, '学生基本情况'),
    resumeText: textField(form.resumeText, 30_000, '简历文字'),
    goal: textField(form.goal, 5_000, '学生目标'),
    concern: textField(form.concern, 10_000, '当前困惑'),
    duration: textField(form.duration, 20, '沟通时长'),
    focus: textField(form.focus, 5_000, '分析重点'),
  }
}

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method === 'OPTIONS') return options(context)
  if (context.request.method !== 'POST') return methodNotAllowed(context)
  if (!sameOrigin(context.request, context.env)) return originError(context)

  const previewError = await requirePreview(context)
  if (previewError) return previewError
  const limited = rateLimit(context)
  if (limited) return limited

  const id = requestId()
  const started = Date.now()
  try {
    const body = await readJson(context.request, MAX_BODY_BYTES)
    if (!isMode(body.mode)) throw new Error('任务模式不正确。')
    const action = body.action === undefined ? 'reanalyze' : body.action
    if (!isAction(action)) throw new Error('生成操作不正确。')
    const form = cleanForm(body.form)
    const snapshot = action === 'reanalyze' ? undefined : body.snapshot
    const knowledge = knowledgeFor(body.mode)
    const generated = await generateAgent(body.mode, form, action, snapshot, context.env, knowledge.text)
    console.info(JSON.stringify({ request_id: id, mode: body.mode, ok: true, duration_ms: Date.now() - started, demo_mode: generated.demoMode }))
    return json(context.request, context.env, 200, { ...generated.result, demo_mode: generated.demoMode, request_id: id })
  } catch (error) {
    console.error(JSON.stringify({ request_id: id, ok: false, duration_ms: Date.now() - started, error_type: error instanceof Error ? error.name : 'Error' }))
    return json(context.request, context.env, 400, { error: safeError(error, '生成失败，请稍后重试。'), request_id: id })
  }
}
