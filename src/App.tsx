import { useMemo, useState, type MouseEvent } from 'react'
import type { FormState, RefinementAction, Result, TaskMode } from './types'
import { hasForbiddenClaim, isCareerScriptClean, modeLabel } from './lib/guards'

function formatApiError(payload: Record<string, unknown>, fallback: string): string {
  const message = typeof payload.error === 'string' && payload.error ? payload.error : fallback
  const errorType = typeof payload.error_type === 'string' && payload.error_type ? payload.error_type : ''
  return errorType ? `${message}（${errorType}）` : message
}

const initialForm: FormState = {
  studentMessage: '', previousChat: '', background: '', teacherNotes: '', product: '尚未确定',
  firstInquiry: true, explicitPriceFollowup: false, nextStep: '', basicSituation: '', resumeText: '',
  goal: '', concern: '', duration: '30', focus: '',
}

const products = ['初步职业规划', '中文简历优化', '完整职业规划', '远程PTA', '远程人事实习', '人事实地实习', '应届生求职陪跑', '全职岗位匹配及内推', '一对一科研', '实习科研双料项目', '尚未确定']

function TextArea({ label, value, onChange, placeholder, required = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  return <label className="field"><span>{label}{required && <b className="required"> *</b>}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>
}

function App() {
  const [mode, setMode] = useState<TaskMode>('student_reply')
  const [form, setForm] = useState<FormState>(initialForm)
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resumeNotice, setResumeNotice] = useState('')
  const [previewCode, setPreviewCode] = useState('')
  const [previewCodeRequired, setPreviewCodeRequired] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewSubmitting, setPreviewSubmitting] = useState(false)
  const [pendingAction, setPendingAction] = useState<RefinementAction | null>(null)
  const [copied, setCopied] = useState(false)

  const update = (key: keyof FormState, value: string | boolean) => setForm((old) => ({ ...old, [key]: value }))
  const modeHint = useMemo(() => ({
    student_reply: '生成可直接复制给学生的回复，并保留内部判断区。',
    product_consultation: '只在明确咨询产品时说明价格、交付和人工核验边界。',
    career_script: '约 30 分钟逐字稿，正式交付全程零销售。',
  }[mode]), [mode])

  async function generate(action: RefinementAction = 'reanalyze') {
    if (mode !== 'career_script' && !form.studentMessage.trim()) { setError('请先填写学生原话。'); return }
    if (mode === 'career_script' && !form.basicSituation.trim() && !form.resumeText.trim() && !form.goal.trim()) { setError('请至少填写学生基本情况、简历文字或目标。'); return }
    setLoading(true); setError(''); setNotice(''); setCopied(false)
    try {
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ mode, form, action, snapshot: action === 'reanalyze' ? undefined : result }) })
      const payload = await response.json()
      if (response.status === 401 && payload.code_required === true) {
        setPendingAction(action)
        setPreviewCodeRequired(true)
        setPreviewError('')
        return
      }
      if (!response.ok) throw new Error(formatApiError(payload, '生成失败，请稍后重试。'))
      setResult(payload as Result)
      if ((payload as Result).demo_mode) setNotice('当前为演示模式，未调用真实模型。')
    } catch (err) { setError(err instanceof Error ? err.message : '生成失败，请稍后重试。') }
    finally { setLoading(false) }
  }

  async function unlockPreview() {
    if (!previewCode.trim()) { setPreviewError('请输入预览访问码。'); return }
    setPreviewSubmitting(true); setPreviewError(''); setError('')
    try {
      const response = await fetch('/api/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ access_code: previewCode }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '访问码验证失败，请重试。')
      const retryAction = pendingAction || 'reanalyze'
      setPreviewCode(''); setPreviewCodeRequired(false); setPendingAction(null)
      await generate(retryAction)
    } catch (err) {
      const message = err instanceof Error ? err.message : '访问码验证失败，请重试。'
      setPreviewError(message)
      if (message.includes('尚未配置')) setError(message)
    } finally { setPreviewSubmitting(false) }
  }

  async function copyReply() {
    if (!result) return
    await navigator.clipboard.writeText(result.recommended_reply)
    setCopied(true); setTimeout(() => setCopied(false), 1600)
  }

  function chooseMode(next: TaskMode) { setMode(next); setResult(null); setError(''); setNotice('') }

  const localResumeMatcher = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  function openResumeMatcher(event: MouseEvent<HTMLAnchorElement>) {
    if (!localResumeMatcher) {
      event.preventDefault()
      setResumeNotice('云端简历匹配暂未启用；当前 Python/Flask 模块仅限本地运行，简历与人工匹配结果请等待人工核实。')
    }
  }

  const actionButtons: Array<[RefinementAction, string]> = [['regenerate', '重新生成'], ['warmer', '更亲和'], ['professional', '更专业'], ['shorter', '更简短']]

  return <div className="shell">
    <header className="topbar"><div><div className="eyebrow">LOCAL PROTOTYPE · PHASE 3</div><h1>求职老师工作台</h1><p className="subtitle">按已审核的企业规范生成学生沟通内容</p></div><div className="status"><span className="status-dot" />本地运行<br /><small>不保存学生历史</small></div></header>
    <nav className="mode-tabs" aria-label="任务选择">
      {([['student_reply', '回复学生'], ['product_consultation', '产品咨询'], ['career_script', '职业规划逐字稿']] as Array<[TaskMode, string]>).map(([key, label]) => <button key={key} className={mode === key ? 'mode-tab active' : 'mode-tab'} onClick={() => chooseMode(key)}>{label}<small>{key === 'student_reply' ? '聊天回复' : key === 'product_consultation' ? '价格与流程' : '约30分钟'}</small></button>)}
      <button className="mode-tab disabled" disabled>简历优化<small>后续开发</small></button><a className="mode-tab matcher-link" href={localResumeMatcher ? 'http://127.0.0.1:5000' : '#resume-matcher-status'} target={localResumeMatcher ? '_blank' : undefined} rel={localResumeMatcher ? 'noreferrer' : undefined} onClick={openResumeMatcher} title={localResumeMatcher ? '需先启动 tools/resume-matcher/start.bat' : '云端暂未启用，等待人工核实'}>简历匹配方案<small>{localResumeMatcher ? '独立本地模块' : '云端暂未启用'}</small></a>
    </nav>
    {resumeNotice && <div id="resume-matcher-status" className="alert demo" role="status">{resumeNotice}</div>}
    <main className="workspace">
      <section className="card input-card"><div className="card-heading"><div><span className="section-kicker">INPUT / {modeLabel(mode)}</span><h2>本轮信息</h2></div><p>{modeHint}</p></div>
        {mode !== 'career_script' ? <>
          <TextArea label="学生原话" required value={form.studentMessage} onChange={(v) => update('studentMessage', v)} placeholder="粘贴学生当前消息，不上传真实简历文件" />
          <TextArea label="前文聊天" value={form.previousChat} onChange={(v) => update('previousChat', v)} placeholder="选填：最近几轮上下文" />
          <TextArea label="学生背景" value={form.background} onChange={(v) => update('background', v)} placeholder="学校、专业、年级、毕业时间、状态、地区、方向、经历等" />
          {mode === 'product_consultation' && <div className="grid two"><label className="field"><span>学生咨询的产品</span><select value={form.product} onChange={(e) => update('product', e.target.value)}>{products.map((p) => <option key={p}>{p}</option>)}</select></label><label className="field"><span>希望推进的下一步</span><input value={form.nextStep} onChange={(e) => update('nextStep', e.target.value)} placeholder="例如：先判断适配度" /></label><label className="check"><input type="checkbox" checked={form.firstInquiry} onChange={(e) => update('firstInquiry', e.target.checked)} /> 第一次询价</label><label className="check"><input type="checkbox" checked={form.explicitPriceFollowup} onChange={(e) => update('explicitPriceFollowup', e.target.checked)} /> 再次明确追问价格</label></div>}
          <TextArea label="老师备注" value={form.teacherNotes} onChange={(v) => update('teacherNotes', v)} placeholder="选填：只供本次分析使用" />
        </> : <>
          <TextArea label="学生基本情况" value={form.basicSituation} onChange={(v) => update('basicSituation', v)} placeholder="学校、专业、年级、毕业时间、求职状态等" />
          <TextArea label="简历文字" value={form.resumeText} onChange={(v) => update('resumeText', v)} placeholder="选填：粘贴已经脱敏的简历文字" />
          <TextArea label="学生目标" value={form.goal} onChange={(v) => update('goal', v)} placeholder="岗位、行业、地区、时间安排等" />
          <TextArea label="当前困惑" value={form.concern} onChange={(v) => update('concern', v)} placeholder="学生最希望这次沟通解决什么" />
          <div className="grid two"><label className="field"><span>目标沟通时长</span><select value={form.duration} onChange={(e) => update('duration', e.target.value)}><option value="30">30 分钟</option><option value="20">20 分钟（仍按核心结构压缩）</option></select></label><label className="field"><span>老师特别希望分析的问题</span><input value={form.focus} onChange={(e) => update('focus', e.target.value)} placeholder="选填" /></label></div>
        </>}
        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert demo">{notice}</div>}
        {previewCodeRequired && <div className="preview-access alert demo"><label className="field"><span>预览访问码</span><input type="password" value={previewCode} onChange={(e) => setPreviewCode(e.target.value)} placeholder="请输入部署负责人提供的访问码" autoComplete="off" /></label>{previewError && <div className="preview-error" role="alert">{previewError}</div>}<button className="preview-submit" onClick={unlockPreview} disabled={previewSubmitting}>{previewSubmitting ? '正在验证…' : '提交访问码'}</button></div>}
        <button className="primary" onClick={() => generate()} disabled={loading}>{loading ? '正在生成…' : '生成回复'}</button>
        <div className="privacy-note">本原型默认不永久保存输入，不记录完整聊天或模型回复；请仅使用脱敏测试材料。</div>
      </section>
      <section className="result-column">
        {result ? <>
          {result.demo_mode && <div className="demo-banner">演示模式 · 未调用真实模型</div>}
          <section className="card reply-card"><div className="card-heading"><div><span className="section-kicker">RECOMMENDED SEND</span><h2>推荐发送</h2></div><button className="copy" onClick={copyReply}>{copied ? '已复制' : '复制回复'}</button></div><textarea className="reply-editor" value={result.recommended_reply} onChange={(e) => setResult({ ...result, recommended_reply: e.target.value })} /><div className="refine-row">{actionButtons.map(([action, label]) => <button key={action} onClick={() => generate(action)} disabled={loading}>{label}</button>)}<button className="reanalyze" onClick={() => generate('reanalyze')} disabled={loading}>重新分析</button></div><p className="hint">语言回炉会锁定事实、价格、判断、风险和人工核验状态；重新分析可能改变判断与回复策略。</p></section>
          <section className="card internal-card"><div className="card-heading"><div><span className="section-kicker">INTERNAL ONLY</span><h2>内部判断</h2></div><span className="warning-pill">内部参考，请勿复制给学生</span></div><div className="analysis-grid"><Info label="学生类型" value={result.internal_analysis.student_type} /><Info label="当前阶段" value={result.internal_analysis.current_stage} /><Info label="核心需求" value={result.internal_analysis.core_need} /><Info label="本轮目标" value={result.internal_analysis.reply_goal} /></div><List label="缺失信息" items={result.internal_analysis.missing_information} /><List label="风险" items={result.internal_analysis.risk_flags} /><div className={result.internal_analysis.manual_review_required ? 'manual required-manual' : 'manual'}><strong>{result.internal_analysis.manual_review_required ? '需要人工确认' : '暂不需要人工确认'}</strong>{result.internal_analysis.manual_review_reason && <span>{result.internal_analysis.manual_review_reason}</span>}</div>{result.uncertain_items.length > 0 && <List label="待核验项" items={result.uncertain_items} />}</section>
          {mode === 'product_consultation' && <section className="card product-summary"><div className="card-heading"><div><span className="section-kicker">PRODUCT CHECK</span><h2>产品核验摘要</h2></div><span className="warning-pill">发送前人工复核</span></div><div className="analysis-grid"><Info label="适配度" value={result.internal_analysis.product_fit || '待判断'} /><Info label="报价状态" value={result.internal_analysis.quote_status || '待判断'} /><Info label="服务范围" value={result.internal_analysis.service_scope || '待核验'} /></div><List label="关键限制" items={result.internal_analysis.key_limits || []} /></section>}
          <section className="facts"><span>FACTS USED</span>{result.facts_used.map((fact) => <em key={fact}>{fact}</em>)}{hasForbiddenClaim(result.recommended_reply) && <b className="danger">检测到需复核表达</b>}{mode === 'career_script' && !isCareerScriptClean(result.recommended_reply) && <b className="danger">逐字稿疑似包含产品/报价词，请人工复核</b>}</section>
        </> : <div className="empty card"><div className="empty-icon">✦</div><h2>等待生成</h2><p>填写左侧信息后，生成一份可直接使用的内容。内部判断与推荐发送会始终分区展示。</p><div className="empty-rule"><span>01</span>选择任务模式</div><div className="empty-rule"><span>02</span>填写脱敏信息</div><div className="empty-rule"><span>03</span>生成并人工复核</div></div>}
      </section>
    </main>
    <footer>求职老师工作台 · 本地原型 · 规范驱动 <span>Phase 3</span></footer>
  </div>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="info"><span>{label}</span><strong>{value || '—'}</strong></div> }
function List({ label, items }: { label: string; items: string[] }) { return <div className="list"><span>{label}</span>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>无</p>}</div> }

export default App
