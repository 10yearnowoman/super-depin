import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateAgent, ProviderError } from './agent-engine'
import type { Env } from '../types'

const env: Env = { DEEPSEEK_API_KEY: 'test-key' }

function generate(overrides: Partial<Env> = {}) {
  return generateAgent('student_reply', {}, 'reanalyze', undefined, { ...env, ...overrides }, '')
}

describe('DeepSeek upstream error diagnostics', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses the official default URL and explicit JSON mode request options', async () => {
    let requestUrl = ''
    let requestBody: Record<string, unknown> = {}
    let authorization = ''
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input)
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      authorization = new Headers(init?.headers).get('authorization') || ''
      return new Response(JSON.stringify({ error: { code: 'bad_request' } }), { status: 400, headers: { 'content-type': 'application/json' } })
    }))

    await expect(generate({ DEEPSEEK_BASE_URL: '', DEEPSEEK_API_KEY: ' test-key ' })).rejects.toMatchObject({ errorType: 'bad_request' })
    expect(requestUrl).toBe('https://api.deepseek.com/chat/completions')
    expect(authorization).toBe('Bearer test-key')
    expect(requestBody).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: false,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    })
  })

  it.each([
    'api.deepseek.com',
    'http://api.deepseek.com',
    'https://api.deepseek.com/chat/completions',
    'https://api.deepseek.com/v1',
    'https://api.deepseek.com?version=1',
  ])('rejects malformed or unexpected DeepSeek Base URL: %s', async (baseUrl) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(generate({ DEEPSEEK_BASE_URL: baseUrl })).rejects.toMatchObject({
      errorType: 'invalid_base_url',
      providerStatus: null,
      providerErrorCode: 'invalid_base_url',
      message: 'DeepSeek Base URL 配置错误，请使用 https://api.deepseek.com。',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses demo mode for a blank API Key without calling DeepSeek', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await generate({ DEEPSEEK_API_KEY: '   ' })
    expect(result.demoMode).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects API Keys with newline or control characters before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(generate({ DEEPSEEK_API_KEY: 'test-key\n' })).rejects.toMatchObject({
      errorType: 'invalid_api_key_format',
      providerStatus: null,
      providerErrorCode: 'invalid_api_key_format',
      message: 'DeepSeek API Key 格式错误，请在 Cloudflare Secret 中重新配置。',
    })
    expect(fetchMock).not.toHaveBeenCalled()
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
