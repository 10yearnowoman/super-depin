import { describe, expect, it } from 'vitest'
import { onRequest as health } from './health'
import { onRequest as generate } from './generate'
import { onRequest as preview } from './preview'

const env = { PREVIEW_PROTECTION_DISABLED: 'true' }
const context = (request: Request, contextEnv: Record<string, string> = env) => ({
  request,
  env: contextEnv,
  params: {},
  next: async () => new Response('next'),
  waitUntil: () => undefined,
})

describe('Cloudflare Pages API routes', () => {
  it('serves health metadata without exposing a secret', async () => {
    const response = await health(context(new Request('https://example.com/api/health')))
    const payload = await response.json() as Record<string, unknown>
    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.runtime).toBe('cloudflare-pages-functions')
    expect(payload.runtime_knowledge_files).toBeGreaterThan(0)
    expect(payload).not.toHaveProperty('DEEPSEEK_API_KEY')
  })

  it('accepts the existing frontend generate payload in demo mode', async () => {
    const response = await generate(context(new Request('https://example.com/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'student_reply',
        action: 'reanalyze',
        form: {
          studentMessage: '我还没有想好方向。',
          previousChat: '',
          background: '',
          teacherNotes: '',
          product: '尚未确定',
          firstInquiry: true,
          explicitPriceFollowup: false,
          nextStep: '',
          basicSituation: '',
          resumeText: '',
          goal: '',
          concern: '',
          duration: '30',
          focus: '',
        },
      }),
    })))
    const payload = await response.json() as Record<string, unknown>
    expect(response.status).toBe(200)
    expect(payload.demo_mode).toBe(true)
    expect(typeof payload.recommended_reply).toBe('string')
    expect(typeof payload.request_id).toBe('string')
  })

  it('returns code_required for an invalid preview code', async () => {
    const response = await preview(context(new Request('https://example.com/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_code: 'wrong' }),
    }), { PREVIEW_ACCESS_CODE: 'letmein' }))
    const payload = await response.json() as Record<string, unknown>
    expect(response.status).toBe(401)
    expect(payload.code_required).toBe(true)
  })

  it('sets a preview cookie that authorizes a generate retry', async () => {
    const protectedEnv = { PREVIEW_ACCESS_CODE: 'letmein' }
    const unlock = await preview(context(new Request('https://example.com/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_code: 'letmein' }),
    }), protectedEnv))
    const setCookie = unlock.headers.get('set-cookie')
    expect(unlock.status).toBe(200)
    expect(setCookie).toContain('preview_session=')

    const response = await generate(context(new Request('https://example.com/api/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: setCookie!.split(';', 1)[0],
      },
      body: JSON.stringify({
        mode: 'student_reply',
        action: 'reanalyze',
        form: { studentMessage: '我还没有想好方向。' },
      }),
    }), protectedEnv))
    const payload = await response.json() as Record<string, unknown>
    expect(response.status).toBe(200)
    expect(payload.demo_mode).toBe(true)
  })

  it('keeps missing preview configuration as a 503', async () => {
    const response = await preview(context(new Request('https://example.com/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_code: 'letmein' }),
    }), {}))
    const payload = await response.json() as Record<string, unknown>
    expect(response.status).toBe(503)
    expect(payload.error).toContain('预览访问码尚未配置')
  })
})
