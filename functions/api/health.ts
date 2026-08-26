import type { PagesFunction } from '../types'
import { json, methodNotAllowed, options, sameOrigin, originError } from '../_lib/http'
import { knowledgeFor } from '../_lib/runtime'

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method === 'OPTIONS') return options(context)
  if (context.request.method !== 'GET') return methodNotAllowed(context)
  if (!sameOrigin(context.request, context.env)) return originError(context)

  const knowledge = knowledgeFor('student_reply')
  return json(context.request, context.env, 200, {
    ok: true,
    runtime: 'cloudflare-pages-functions',
    demo_mode: !Boolean(context.env.DEEPSEEK_API_KEY),
    deepseek_configured: Boolean(context.env.DEEPSEEK_API_KEY),
    model: context.env.DEEPSEEK_MODEL || 'deepseek-chat',
    runtime_knowledge_files: knowledge.files.length,
    resume_matcher: 'local-only-awaiting-manual-verification',
  })
}
