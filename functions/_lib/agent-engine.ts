import type { Env } from '../types'
import { normalizeResult, type AgentAction, type AgentMode } from './schema'

type Form = Record<string, unknown>

export const DEFAULT_MODEL = 'deepseek-v4-flash'
export const DEFAULT_BASE_URL = 'https://api.deepseek.com'

export type ProviderErrorType = 'bad_request' | 'invalid_api_key' | 'invalid_api_key_format' | 'invalid_base_url' | 'insufficient_balance' | 'rate_limited' | 'service_busy' | 'upstream_error' | 'network_error' | 'timeout' | 'invalid_response'

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly errorType: ProviderErrorType,
    readonly providerStatus: number | null,
    readonly providerErrorCode: string,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export function modelFor(env: Pick<Env, 'DEEPSEEK_MODEL'>): string {
  return env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL
}

export function baseUrlFor(env: Pick<Env, 'DEEPSEEK_BASE_URL'>): string {
  const configured = env.DEEPSEEK_BASE_URL?.trim()
  if (!configured) return DEFAULT_BASE_URL
  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('invalid')
    return url.origin
  } catch {
    throw new ProviderError('DeepSeek Base URL 配置错误，请使用 https://api.deepseek.com。', 'invalid_base_url', null, 'invalid_base_url')
  }
}

export function apiKeyFor(env: Pick<Env, 'DEEPSEEK_API_KEY'>): string | null {
  const configured = env.DEEPSEEK_API_KEY
  if (!configured) return null
  if (/[\u0000-\u001F\u007F-\u009F]/.test(configured)) {
    throw new ProviderError('DeepSeek API Key 格式错误，请在 Cloudflare Secret 中重新配置。', 'invalid_api_key_format', null, 'invalid_api_key_format')
  }
  return configured.trim() || null
}

function providerMessage(status: number): { message: string; errorType: ProviderErrorType } {
  if (status === 400 || status === 422) return { message: 'DeepSeek 请求参数或格式错误，请检查输入后重试。', errorType: 'bad_request' }
  if (status === 401) return { message: 'DeepSeek API Key 无效，请联系管理员检查 Cloudflare Secret。', errorType: 'invalid_api_key' }
  if (status === 402) return { message: 'DeepSeek API 账户余额不足，请联系管理员处理。', errorType: 'insufficient_balance' }
  if (status === 429) return { message: 'DeepSeek 请求过于频繁，请稍后再试。', errorType: 'rate_limited' }
  if (status === 500 || status === 503) return { message: 'DeepSeek 服务繁忙，请稍后重试。', errorType: 'service_busy' }
  return { message: 'DeepSeek 上游服务返回错误，请稍后重试。', errorType: 'upstream_error' }
}

function safeProviderCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim()
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(code) ? code : null
}

async function readProviderErrorCode(response: Response): Promise<string> {
  const fallback = `http_${response.status}`
  try {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > 64 * 1024) return fallback
    const payload = JSON.parse(text) as { code?: unknown; error?: { code?: unknown } }
    return safeProviderCode(payload.error?.code) || safeProviderCode(payload.code) || fallback
  } catch {
    return fallback
  }
}

function upstreamError(status: number, providerErrorCode: string): ProviderError {
  const mapped = providerMessage(status)
  return new ProviderError(mapped.message, mapped.errorType, status, providerErrorCode)
}

function refine(snapshot: Record<string, unknown>, action: AgentAction, mode: AgentMode) {
  const copy = structuredClone(snapshot)
  const reply = typeof copy.recommended_reply === 'string' ? copy.recommended_reply : ''
  const prefix = action === 'warmer' ? '我先帮您把重点说得更清楚一些：' : action === 'professional' ? '结合目前材料，专业判断是：' : ''
  copy.recommended_reply = action === 'shorter' ? `${reply.split(/[。！？]/).filter(Boolean).slice(0, 2).join('。')}。` : `${prefix}${reply}`
  return normalizeResult(copy, mode)
}

function mockStudent(form: Form) {
  const hasBackground = typeof form.background === 'string' && form.background.trim().length > 0
  return { task_mode: 'student_reply', internal_analysis: { student_type: hasBackground ? '已有背景待分析' : '信息尚不完整', current_stage: '首次信息收集', core_need: '明确目标与材料证据的对应关系', missing_information: hasBackground ? [] : ['学校、专业、年级/毕业时间、目标方向和时间边界'], risk_flags: [], reply_goal: '收齐会改变判断的关键信息', manual_review_required: false, manual_review_reason: '' }, recommended_reply: hasBackground ? '您好，我先结合您提供的情况做一个初步判断。当前最需要确认的是目标方向和经历证据是否能对应上。您可以先把最想争取的岗位、所在城市和一段最能代表个人贡献的经历补充给我，我再帮您把下一步收得更具体。' : '您好，我先帮您把情况收完整。麻烦您补充学校、专业、年级或毕业时间、目前求职状态、目标城市、目标方向和已有经历，我会先判断当前主要卡在方向、材料还是投递节奏。', facts_used: ['当前任务模式：学生聊天回复'], uncertain_items: hasBackground ? [] : ['学校、专业、年级/毕业时间、目标方向和时间边界'] }
}

function mockProduct(form: Form) {
  const product = typeof form.product === 'string' && form.product ? form.product : '尚未确定'
  const prices: Record<string, string> = { '初步职业规划': '99 元', '中文简历优化': '199 元', '完整职业规划': '299 元', '远程PTA': '24800 元', '远程人事实习': '24800 元', '人事实地实习': '26800 元', '应届生求职陪跑': '32800 元、最长 12 个月', '一对一科研': '待人工确认', '尚未确定': '需要结合具体产品确认' }
  const scopes: Record<string, string> = { '初步职业规划': '轻量方向判断；精确交付清单待确认', '中文简历优化': '中文简历内容重写与版式调整，正常 48 小时以内，合理范围一轮修改', '完整职业规划': '背景/简历分析、约 30 分钟沟通和规划报告', '远程PTA': '线上导师项目；不属于正式企业任职，不提供企业实习证明', '远程人事实习': '远程线上办公；需项目/企业审核，完成并达标后按约定核验实习证明', '人事实地实习': '企业实地办公；需项目/企业审核，完成并达标后按约定核验实习证明', '应届生求职陪跑': '方向与策略、材料、笔面试、岗位申请、辅导及 Offer/入职指导', '一对一科研': '一对一科研项目，具体交付、周期和成果需人工核验', '尚未确定': '需先确认具体产品和交付范围' }
  const manual = product === '一对一科研' || product === '尚未确定'
  const reply = product === '尚未确定' ? '您好，目前需要先确认您具体咨询的是哪一类服务。您可以告诉我是方向规划、中文简历、实习、长期陪跑、全职岗位匹配还是科研，我再按对应的真实价格和交付说明。' : `您好，您咨询的是${product}，当前公开价格口径是${prices[product] ?? '待确认'}。具体还要结合您的背景、目标和项目条件核对交付、审核、周期及限制；这类服务不承诺录取、Offer、入职、证明或推荐信。${manual ? '具体价格或项目内容需要工作人员人工核验后确认。' : ''}`
  return { task_mode: 'product_consultation', internal_analysis: { student_type: '产品咨询者', current_stage: form.explicitPriceFollowup ? '再次明确询价' : '首次产品咨询', core_need: `确认${product}是否适配及其真实交付`, missing_information: form.background ? [] : ['学校、专业、年级/毕业时间、经历和目标'], risk_flags: manual ? ['具体价格或项目需要人工核验'] : [], reply_goal: '说明真实价格、边界和下一步', manual_review_required: manual, manual_review_reason: manual ? '当前价格或项目交付不能由 Agent 最终确认' : '', product_fit: form.background ? '可基于已提供背景做初步适配判断，最终以项目/企业审核为准' : '当前信息不足，暂不能确认适配度', quote_status: manual ? '不能直接最终报价，必须人工核验' : '可以说明公开价格，同时核对交付与限制', service_scope: scopes[product] ?? '待人工核验', key_limits: ['不保证录取、Offer、入职、证明、推荐信或背调'] }, recommended_reply: reply, facts_used: [`产品：${product}`, `公开价格：${prices[product] ?? '待确认'}`, `服务范围：${scopes[product] ?? '待人工核验'}`], uncertain_items: manual ? ['具体报价/项目交付范围'] : [] }
}

function mockCareer(form: Form) {
  return { task_mode: 'career_script', internal_analysis: { student_type: '职业规划初诊对象', current_stage: '30 分钟逐字稿生成', core_need: form.concern || '明确方向、证据缺口和行动顺序', missing_information: [!form.basicSituation && '学生基本情况', !form.goal && '目标岗位/地区/时间', !form.resumeText && '简历文字'].filter(Boolean), risk_flags: ['本模式零销售，结尾不得连接任何公司产品'], reply_goal: '完成方向诊断、行动计划和自我验证', manual_review_required: false, manual_review_reason: '' }, recommended_reply: `【0—2 分钟｜照读】您好，今天我们用大约 ${form.duration || '30'} 分钟，把您的目标、现有证据和下一步行动收清楚。\n\n【2—8 分钟｜核实】我先确认几个会改变判断的问题：您最想争取的方向是什么，预计在哪个时间窗口投递，目前最能证明个人能力的经历有哪些？\n\n【8—12 分钟｜诊断】结合目前信息，先把问题分成方向、材料证据和执行节奏三类，我们逐一排优先级。\n\n【12—18 分钟｜方向】主方向先选择证据最强、最容易形成投递闭环的一项；备选方向需要说明还缺什么证据，暂不把多个方向平均用力。\n\n【18—23 分钟｜短板】请把经历写成“问题—动作—结果—个人贡献”，数据补齐平台、周期、基数和证据；没有成品作品时，先整理可脱敏的过程材料。\n\n【23—28 分钟｜行动】今天完成方向排序，三天内完成主版本材料，七天内做一轮小规模验证，记录投递、沟通和追问反馈。必要时可以客观补充真实实习、科研、项目或技能证据，但先以真实目标和可完成的行动为准。\n\n【28—30 分钟｜总结】最后我确认一下：您的第一步是什么？请您按优先级执行，并记录一周后的真实反馈，再决定是否调整方向、岗位层级或证据准备。`, facts_used: [String(form.basicSituation || '学生基本情况待补充'), '职业规划模式：零销售'], uncertain_items: [] }
}

export async function generateAgent(mode: AgentMode, form: Form, action: AgentAction, snapshot: unknown, env: Env, knowledgeText: string): Promise<{ result: Record<string, unknown>; demoMode: boolean }> {
  if (action !== 'reanalyze' && snapshot && typeof snapshot === 'object') return { result: refine(snapshot as Record<string, unknown>, action, mode), demoMode: true }
  const model = modelFor(env)
  const apiKey = apiKeyFor(env)
  if (!apiKey) {
    const raw = mode === 'career_script' ? mockCareer(form) : mode === 'product_consultation' ? mockProduct(form) : mockStudent(form)
    return { result: normalizeResult(raw, mode), demoMode: true }
  }
  const baseUrl = baseUrlFor(env)
  const prompt = `你是本地求职老师工作台的结构化输出引擎。任务模式：${mode}。严格遵守以下公开知识，只输出 JSON，不输出 Markdown 代码围栏。不得编造学生经历、企业内部信息、录取概率或保证；不得在职业规划逐字稿中销售。\n${knowledgeText}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, temperature: 0.2, stream: false, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify({ form, snapshot: action === 'reanalyze' ? undefined : snapshot }) }] }), signal: controller.signal })
    if (!response.ok) throw upstreamError(response.status, await readProviderErrorCode(response))
    let data: { choices?: Array<{ message?: { content?: unknown } }> }
    try {
      data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }
    } catch {
      throw new ProviderError('DeepSeek 返回格式异常，请稍后重试。', 'invalid_response', null, 'invalid_response')
    }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new ProviderError('DeepSeek 返回格式异常，请稍后重试。', 'invalid_response', null, 'invalid_response')
    const clean = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    try {
      return { result: normalizeResult(JSON.parse(clean), mode), demoMode: false }
    } catch {
      throw new ProviderError('DeepSeek 返回格式异常，请稍后重试。', 'invalid_response', null, 'invalid_response')
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error
    if ((error instanceof DOMException && error.name === 'AbortError') || controller.signal.aborted) {
      throw new ProviderError('DeepSeek 请求超时，请稍后重试。', 'timeout', null, 'timeout')
    }
    throw new ProviderError('无法连接 DeepSeek 服务，请稍后重试。', 'network_error', null, 'network_error')
  } finally {
    clearTimeout(timeout)
  }
}
