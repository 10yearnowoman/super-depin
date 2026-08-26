import { describe, expect, it } from 'vitest'
import { onRequest as health } from './health'
import { onRequest as generate } from './generate'

const env = { PREVIEW_PROTECTION_DISABLED: 'true' }
const context = (request: Request) => ({
  request,
  env,
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
})
