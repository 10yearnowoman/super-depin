import generated from '../_generated/runtime-knowledge'

export type RuntimeMode = 'student_reply' | 'product_consultation' | 'career_script'

export function knowledgeFor(mode: RuntimeMode): { files: string[]; text: string } {
  const files = [...generated.fixed, ...(generated.byMode[mode] || [])]
  const unique = [...new Set(files)]
  return { files: unique, text: unique.map((file) => `\n--- ${file} ---\n${generated.files[file] || ''}`).join('\n') }
}

export function productConfig() {
  return generated.productConfig
}
