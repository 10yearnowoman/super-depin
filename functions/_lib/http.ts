import type { Env, PagesContext } from '../types'

export function requestOrigin(request: Request): string {
  return new URL(request.url).origin
}

export function allowedOrigin(request: Request, env: Env): string {
  return env.ALLOWED_ORIGIN || env.APP_ORIGIN || requestOrigin(request)
}

export function sameOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  return origin === allowedOrigin(request, env)
}

export function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  const origin = request.headers.get('Origin')
  if (origin && origin === allowedOrigin(request, env)) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-credentials', 'true')
    headers.set('vary', 'Origin')
  }
  return headers
}

export function json(request: Request, env: Env, status: number, payload: Record<string, unknown>, extra?: HeadersInit): Response {
  const headers = corsHeaders(request, env)
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value))
  return new Response(JSON.stringify(payload), { status, headers })
}

export function methodNotAllowed(context: PagesContext): Response {
  return json(context.request, context.env, 405, { error: '请求方法不支持。' }, { allow: 'GET, POST, OPTIONS' })
}

export function originError(context: PagesContext): Response {
  return json(context.request, context.env, 403, { error: '请求来源未被允许。' })
}

export function options(context: PagesContext): Response {
  const headers = corsHeaders(context.request, context.env)
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  headers.set('access-control-allow-headers', 'content-type')
  headers.set('access-control-max-age', '600')
  return new Response(null, { status: 204, headers })
}

export function requestId(): string {
  return crypto.randomUUID()
}

export function safeError(error: unknown, fallback = '服务暂时不可用，请稍后重试。'): string {
  if (error instanceof Error && /请求体|访问码|模型|简历|导师|项目形式|学生类型|请求来源/.test(error.message)) return error.message
  return fallback
}

export async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > maxBytes) throw new Error('请求内容过大，请缩短输入后重试。')
  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > maxBytes) throw new Error('请求内容过大，请缩短输入后重试。')
  try {
    const parsed = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('请求格式不正确。')
    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof Error && error.message === '请求格式不正确。') throw error
    throw new Error('请求格式不正确。')
  }
}

export function textField(value: unknown, max: number, label: string, required = false): string {
  if (typeof value !== 'string') {
    if (required) throw new Error(`${label}不能为空。`)
    return ''
  }
  const text = value.trim()
  if (required && !text) throw new Error(`${label}不能为空。`)
  if (text.length > max) throw new Error(`${label}过长，请缩短后重试。`)
  return text
}
