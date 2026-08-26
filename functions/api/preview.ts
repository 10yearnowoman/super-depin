import type { PagesFunction } from '../types'
import { establishPreview } from '../_lib/access'
import { json, methodNotAllowed, options, originError, readJson, safeError, sameOrigin, textField } from '../_lib/http'

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method === 'OPTIONS') return options(context)
  if (context.request.method !== 'POST') return methodNotAllowed(context)
  if (!sameOrigin(context.request, context.env)) return originError(context)

  try {
    const body = await readJson(context.request, 8_192)
    const accessCode = textField(body.access_code ?? body.accessCode, 256, '预览访问码', true)
    return establishPreview(context, accessCode)
  } catch (error) {
    return json(context.request, context.env, 400, { error: safeError(error, '访问码请求格式不正确，请重试。') })
  }
}
