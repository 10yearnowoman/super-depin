# 求职老师工作台（Cloudflare Pages 适配版）

这是一个 Vite + Cloudflare Pages Functions 工作台，提供学生聊天回复、产品咨询和职业规划逐字稿三种任务；“简历匹配方案”仍通过主工作台的独立入口连接到仅限本地的 `tools/resume-matcher/` Flask 模块。没有 API Key 时进入明确的 Mock 演示模式，不保存真实学生历史、不连接数据库或云端服务。

## 启动

1. 安装 Node.js 18+ 与 pnpm。
2. 在项目目录执行 `pnpm install`。
3. 直接双击 `启动原型.bat`，或执行 `pnpm dev`。
4. 浏览器打开 `http://localhost:5173`。

如需本地真实模型：复制 `.env.example` 为 `.env.local`，只在服务端填写 `DEEPSEEK_API_KEY`、可选 `DEEPSEEK_BASE_URL` 与 `DEEPSEEK_MODEL`，然后重启 API。密钥不会进入前端构建产物或日志。Cloudflare Pages 上必须把 `DEEPSEEK_API_KEY` 配置为 Secret；可选配置 `DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL`，未配置模型时默认使用 `deepseek-v4-flash`。

如需使用“简历匹配方案”，另行双击 `tools/resume-matcher/start.bat`（或在该目录运行 `python app.py`），再从本工作台点击“简历匹配方案”；其页面会在 `http://127.0.0.1:5000` 打开。该模块要求上传简历并粘贴渠道老师人工匹配结果，社招候选人不会生成 Word。

没有配置 Key 时，页面会显示“当前为演示模式，未调用真实模型”，可用于完整体验界面和结构化输出，但不代表真实模型质量。关闭方式：关闭由 `启动原型.bat` 打开的 API/网页窗口，或在启动终端按 `Ctrl+C`。

常见问题：若页面无法打开，先确认 `http://localhost:8787/api/health` 可访问，再检查 5173 端口是否被占用；若真实模型报配置错误，检查 `.env.local` 的 Key 和模型名后重启 API。模型无法解析时，界面只显示中文错误提示，不展示系统提示词或堆栈。

## Cloudflare Pages

Pages Functions 路由为 `GET /api/health` 和 `POST /api/generate`，前端请求格式与本地工作台一致。构建前会从显式白名单生成 `functions/_generated/runtime-knowledge.ts`，不会在 Functions 中读取本地文件或使用 `process.env`。

GitHub Private Repository 的分支、构建命令、输出目录、Secret 和本地/云端功能边界见 [CLOUDFLARE_DEPLOYMENT_READY.md](CLOUDFLARE_DEPLOYMENT_READY.md)。

## 当前边界

简历优化、数据库、登录、微信自动发送、DeepSeek 以外的 Provider 和正式历史记录均未实现；简历匹配方案作为独立本地 Flask 模块维护，不与主工作台的三种回复模式混用。云端入口会明确显示“云端暂未启用/等待人工核实”，不会假装已部署。灰色入口标注为“后续开发”。

运行时知识读取遵循 [agent/RUNTIME_LOAD_POLICY.md](agent/RUNTIME_LOAD_POLICY.md)，不会扫描整个项目 Markdown。
