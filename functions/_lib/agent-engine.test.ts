import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateAgent, ProviderError } from './agent-engine'

const env = { DEEPSEEK_API_KEY: 'test-key' }

function generate() {
  return generateAgent('student_reply', {}, 'reanalyze', undefined, env, '')
}

describe('DeepSeek upstream error diagnostics', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([
    [400, 'bad_request'],
    [422, 'bad_request'],
    [401, 'invalid_api_key'],
    [402, 'insufficient_balance'],
    [429, 'rate_limited'],
    [500, 'service_busy'],
    [503, 'service_busy'],
  ])('maps provider status %s to %s without exposing upstream text', async (status, errorType) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: `provider_${status}`, message: 'sensitive upstream response' } }), { status, headers: { 'content-type': 'application/json' } })))

    const error = await generate().catch((caught) => caught)
    expect(error).toBeInstanceOf(ProviderError)
    const providerError = error as ProviderError
    expect(providerError.providerStatus).toBe(status)
    expect(providerError.providerErrorCode).toBe(`provider_${status}`)
    expect(providerError.errorType).toBe(errorType)
    expect(providerError.message).not.toContain('sensitive upstream response')
    expect(providerError.message).toContain('DeepSeek')
  })

  it('separates network failures from provider HTTP failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('sensitive socket details') }))

    await expect(generate()).rejects.toMatchObject({
      errorType: 'network_error',
      providerStatus: null,
      providerErrorCode: 'network_error',
      message: '无法连接 DeepSeek 服务，请稍后重试。',
    })
  })

  it('separates timeout failures from network failures', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))

    const rejection = generate().then(() => undefined, (error) => error)
    await vi.advanceTimersByTimeAsync(20_001)
    await expect(rejection).resolves.toMatchObject({
      errorType: 'timeout',
      providerStatus: null,
      providerErrorCode: 'timeout',
      message: 'DeepSeek 请求超时，请稍后重试。',
    })
  })
})
