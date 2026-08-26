export interface Env {
  APP_ORIGIN?: string
  ALLOWED_ORIGIN?: string
  PREVIEW_ACCESS_CODE?: string
  PREVIEW_PROTECTION_DISABLED?: string
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_BASE_URL?: string
  DEEPSEEK_MODEL?: string
  BUILD_VERSION?: string
  ENVIRONMENT?: string
}

export interface PagesContext<E = Env> {
  request: Request
  env: E
  params: Record<string, string | string[]>
  next: () => Promise<Response>
  waitUntil: (promise: Promise<unknown>) => void
  functionPath?: string
}

export type PagesFunction<E = Env> = (context: PagesContext<E>) => Response | Promise<Response>
