import type { Env, PagesContext } from '../types'
import { json } from './http'

const COOKIE = 'preview_session'
const SESSION_SECONDS = 60 * 60
const WINDOW_MS = 10 * 60 * 1000
const MAX_FAILURES = 5
const attempts = new Map<string, { count: number; resetAt: number }>()
const rates = new Map<string, { count: number; resetAt: number }>()

function clientKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown'
}

function protectionDisabled(env: Env): boolean {
  return env.PREVIEW_PROTECTION_DISABLED === 'true'
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  let binary = ''
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toBase64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

async function token(secret: string, now = Date.now()): Promise<string> {
  const stamp = Math.floor(now / 1000).toString()
  const nonce = crypto.randomUUID()
  const payload = `${stamp}.${nonce}`
  return `${toBase64Url(new TextEncoder().encode(payload))}.${await hmac(secret, payload)}`
}

async function validToken(value: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!value) return false
  const [encoded, signature] = value.split('.')
  if (!encoded || !signature) return false
  try {
    const payload = new TextDecoder().decode(fromBase64Url(encoded))
    const [stamp] = payload.split('.')
    const age = Math.floor(now / 1000) - Number(stamp)
    if (!Number.isFinite(age) || age < 0 || age > SESSION_SECONDS) return false
    const expected = await hmac(secret, payload)
    const a = new TextEncoder().encode(expected)
    const b = new TextEncoder().encode(signature)
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
    return diff === 0
  } catch {
    return false
  }
}

export async function requirePreview(context: PagesContext): Promise<Response | null> {
  const { request, env } = context
  if (protectionDisabled(env)) return null
  const secret = env.PREVIEW_ACCESS_CODE
  if (!secret) return json(request, env, 503, { error: '预览访问码尚未配置，请联系部署负责人。' })
  if (await validToken(request.headers.get('Cookie')?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1] || null, secret)) return null
  return json(request, env, 401, { error: '需要输入预览访问码。', code_required: true })
}

export async function establishPreview(context: PagesContext, accessCode: string): Promise<Response> {
  const { request, env } = context
  const secret = env.PREVIEW_ACCESS_CODE
  if (!secret) return json(request, env, 503, { error: '预览访问码尚未配置，请联系部署负责人。' })
  const key = clientKey(request)
  const now = Date.now()
  const current = attempts.get(key)
  if (current && current.resetAt > now && current.count >= MAX_FAILURES) return json(request, env, 429, { error: '访问码尝试次数过多，请稍后再试。' })
  if (accessCode !== secret) {
    const next = current && current.resetAt > now ? { count: current.count + 1, resetAt: current.resetAt } : { count: 1, resetAt: now + WINDOW_MS }
    attempts.set(key, next)
    return json(request, env, 401, { error: '访问码不正确，请重新输入。', code_required: true })
  }
  attempts.delete(key)
  const value = await token(secret, now)
  const headers = new Headers({ 'set-cookie': `${COOKIE}=${value}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict` })
  return json(request, env, 200, { ok: true, message: '预览访问已开启。' }, headers)
}

export function rateLimit(context: PagesContext, limit = 20): Response | null {
  const key = clientKey(context.request)
  const now = Date.now()
  const current = rates.get(key)
  if (!current || current.resetAt <= now) {
    rates.set(key, { count: 1, resetAt: now + 60_000 })
    return null
  }
  if (current.count >= limit) return json(context.request, context.env, 429, { error: '请求过于频繁，请稍后再试。' })
  current.count += 1
  return null
}
