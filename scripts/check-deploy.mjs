import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targets = ['dist', 'functions']
const forbidden = [/DEEPSEEK_API_KEY\s*=[^\s#]/i, /authorization\s*:\s*['"`]Bearer\s*\$?\{?DEEPSEEK/i, /migration[\\/]raw/i, /INTERNAL_RESTRICTED_KNOWLEDGE/i, /供应商合同/, /真实学生简历/, /wxid_[A-Za-z0-9_-]+/]
const sensitiveFiles = ['.env', '.env.local', '.dev.vars']
const ignored = /(?:node_modules|\.git|__pycache__|dist[\\/]assets)/i
const textExtensions = new Set(['.js', '.mjs', '.ts', '.tsx', '.json', '.md', '.html', '.yaml', '.yml', '.toml', '.bat', '.txt'])

async function walk(target) {
  const absolute = path.join(root, target)
  try { const stat = await fs.stat(absolute); if (stat.isFile()) return [absolute] } catch { return [] }
  const entries = await fs.readdir(absolute, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    const relative = path.relative(root, path.join(absolute, entry.name))
    if (ignored.test(relative)) continue
    result.push(...(entry.isDirectory() ? await walk(relative) : [path.join(absolute, entry.name)]))
  }
  return result
}

const failures = []
for (const route of ['functions/api/health.ts', 'functions/api/generate.ts']) {
  try { await fs.access(path.join(root, route)) } catch { failures.push(`缺少 Cloudflare Pages Function 路由：${route}`) }
}
try {
  const generatedText = await fs.readFile(path.join(root, 'functions', '_generated', 'runtime-knowledge.ts'), 'utf8')
  if (generatedText.includes('Generated placeholder') || !generatedText.includes('agent/system/identity.md')) failures.push('运行时知识未生成实际内容')
} catch { failures.push('缺少实际生成的运行时知识文件：functions/_generated/runtime-knowledge.ts') }
for (const file of sensitiveFiles) {
  try { await fs.access(path.join(root, file)); failures.push(`禁止提交敏感文件：${file}`) } catch {}
}
for (const file of await walk('functions')) {
  if (!/\.(?:mjs|cjs|js|ts|tsx)$/.test(file)) continue
  const text = await fs.readFile(file, 'utf8')
  if (/from ['"]node:|require\(['"](?:fs|node:|process)|process\.env|fs\./.test(text)) failures.push(`Functions 使用了 Node 专属运行时 API：${path.relative(root, file)}`)
}
for (const target of targets) {
  for (const file of await walk(target)) {
    if (!textExtensions.has(path.extname(file).toLowerCase())) continue
    const text = await fs.readFile(file, 'utf8')
    if (forbidden.some((pattern) => pattern.test(text))) failures.push(`发现禁止内容：${path.relative(root, file)}`)
  }
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('deploy safety check passed')
