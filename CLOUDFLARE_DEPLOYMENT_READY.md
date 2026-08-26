# Cloudflare Pages 上线前最终清单

## 当前结论

代码层面可以进入 Cloudflare 部署准备阶段；本地最终检查通过后，本项目不需要再修改 UI 布局即可连接 GitHub Private Repository。当前仍未部署；远程 `main` 已通过普通推送更新并核验。

Cloudflare Pages 使用根目录 `functions/` 的文件路径生成 Pages Functions 路由；本项目的 `functions/api/health.ts`、`functions/api/generate.ts` 与 `functions/api/preview.ts` 分别对应 `/api/health`、`/api/generate` 与 `/api/preview`。参考：[Pages Functions 入门](https://developers.cloudflare.com/pages/functions/get-started/) 和 [Functions 路由](https://developers.cloudflare.com/pages/functions/routing/)。

## Pages 配置

| 项目 | 配置 |
|---|---|
| GitHub 仓库 | `https://github.com/10yearnowoman/super-depin.git`（Private，`main` 已推送并核验） |
| 生产分支 | `main` |
| 根目录 | `/`（仓库根目录） |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| Node.js | 18+；需能执行 `node`、`npm` 与项目依赖 |
| Functions 目录 | 根目录 `functions/`，不要放入 `dist/` |

React/Vite 的 Pages 默认组合也是 `npm run build` + `dist`，见 [Cloudflare Vite 部署说明](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)。

## 必须配置的环境变量/Secret

- `DEEPSEEK_API_KEY`：Cloudflare Pages Production 与 Preview 均配置为 Secret；只在 Functions Runtime 读取，不能写入前端代码、仓库或构建输出。
- `DEEPSEEK_MODEL`：可选，未配置时使用 `deepseek-chat`。
- `DEEPSEEK_BASE_URL`：可选，默认为 `https://api.deepseek.com`。
- `ALLOWED_ORIGIN`：如需限制自定义域名，可配置为完整的站点 Origin；同源部署可不配。
- `PREVIEW_ACCESS_CODE`：如需保护 Preview 环境则配置；配置后 `/api/generate` 需要预览会话 Cookie。
- `PREVIEW_PROTECTION_DISABLED`：仅在明确需要关闭 Preview 保护时设为 `true`，生产环境不建议关闭。

不把任何 `.env`、`.env.local`、`.dev.vars` 内容复制到 Pages 构建变量；生产密钥使用 Cloudflare 的 Secret 配置入口。

## 云端会进入的范围

- `dist/`：Vite 生成的静态前端资产（本地 Git 忽略，Pages 构建时生成）。
- `functions/api/health.ts`、`functions/api/generate.ts`、`functions/api/preview.ts`：实际 HTTP 路由；其中 `/api/preview` 用于建立预览访问 Cookie。
- `functions/_lib/` 与 `functions/types.ts`：校验、访问保护、限流、HTTP 响应、DeepSeek 调用和运行时类型。
- `functions/_generated/runtime-knowledge.ts`：由 `node scripts/build-runtime-knowledge.mjs` 在构建前从显式白名单生成的公开知识包。
- 运行时知识包中的公开 `agent/system/`、`agent/knowledge/`、`agent/examples/` 选定文件和 `agent/knowledge/public-product-config.json`。

运行时不会使用 Node 文件系统读取知识，也不会使用 `process.env` 读取密钥；模型调用通过 Pages `context.env.DEEPSEEK_API_KEY` 完成。

## 只允许本地使用的范围

- `.env`、`.env.local`、`.dev.vars` 及其中的任何值；示例文件只允许保留空值模板。
- `migration/`：原始导出、规范化聊天记录、报告、附件和迁移中间资料。
- `INTERNAL_RESTRICTED_KNOWLEDGE.md`、`AGENT_SPEC.md`、`STUDENT_DISCLOSURE_MATRIX.md`、`agent/RUNTIME_LOAD_POLICY.md`、未列入运行时白名单的旧知识/案例及历史/阶段报告。
- `tools/resume-matcher/`：Python/Flask 简历匹配模块、岗位数据、上传简历、人工匹配结果和生成的 Word 文件。
- 真实简历、聊天原始导出、未经脱敏附件、临时输出和 Python `__pycache__`。
- `server/`：仅用于本地 Node API 开发，不是 Cloudflare Pages Functions 运行时入口。

`.gitignore` 已覆盖上述本地范围；提交前仍应运行 `git status --ignored` 与部署安全检查确认没有误纳入文件。

## 当前功能状态

| 功能 | 状态 |
|---|---|
| 学生聊天回复 | 云端可用；配置 Secret 后调用 DeepSeek，未配置时显示明确 Demo 模式 |
| 产品咨询 | 云端可用；价格、交付、边界和人工核验状态保留 |
| 职业规划逐字稿 | 云端可用；保持零销售规则 |
| 推荐回复/内部判断分区 | 已保留，未做大幅 UI 改版 |
| 简历匹配方案 | Python/Flask 仍只能本地运行；云端入口明确显示“云端暂未启用”，不静默失败 |
| 简历匹配结果与人工核实入口 | 本地 Flask 页面保留；正式方案仍要求上传简历并粘贴人工匹配结果 |
| 简历优化 | 未启用，继续显示后续开发 |

## 已执行检查

- `npm run build`：通过；当前受限终端使用等价的 `pnpm run build` 执行同一脚本。
- `npm run typecheck`：通过；当前使用 `pnpm run typecheck`。
- `npm test`：通过，11 tests passed；当前使用 `pnpm test`。
- 部署检查：`pnpm run check:deploy` 通过。
- `dist/`：已生成 `index.html` 与前端 assets。
- `/api/health`：`functions/api/health.ts` 存在，并已通过路由测试。
- `/api/generate`：`functions/api/generate.ts` 存在，接受当前前端 POST 请求格式，并已通过 Demo 路由测试；缺少预览 Cookie 时返回 `401 + code_required`，前端会引导输入访问码后自动重试。
- `/api/preview`：`functions/api/preview.ts` 存在，校验访问码并通过 `credentials: include` 建立预览会话 Cookie。
- Functions 运行时扫描：未发现 `node:`、文件系统读取或 `process.env`。
- 本地 Git：`main` 已跟踪 `origin/main`；远程已通过普通 `git push -u origin main` 更新，未使用 force。

## 部署后必须人工测试

1. 用真实 Pages 域名访问 `/api/health`，确认 `ok=true`、`runtime=cloudflare-pages-functions`，且响应不包含 Secret。
2. 在 Preview 和 Production 分别配置 Secret，使用脱敏输入测试学生回复、产品咨询、职业规划三种模式。
3. 检查 DeepSeek 成功调用、超时、非 JSON 返回和上游错误时，页面只显示用户可读错误，不泄露密钥、提示词或堆栈。
4. 检查同源策略、Preview 访问码和限流行为；确认浏览器 Network 中没有 API Key。
5. 验证语言回炉不会改变事实、价格、风险和人工核验状态；验证“重新分析”仍可重新判断。
6. 验证职业规划逐字稿不出现产品、报价或促签内容。
7. 验证产品咨询中需要人工确认的价格/交付明确显示人工核验。
8. 点击“简历匹配方案”：云端应显示“云端暂未启用/等待人工核实”，本地启动 Flask 后仍能进入原有页面，并验证人工匹配结果缺失时不会生成正式方案。
9. 使用 Cloudflare Preview 部署完成后，再由负责人决定是否发布 Production；本次任务不包含发布动作。
