export type TaskMode = 'student_reply' | 'product_consultation' | 'career_script'
export type RefinementAction = 'regenerate' | 'warmer' | 'professional' | 'shorter' | 'reanalyze'

export type FormState = {
  studentMessage: string
  previousChat: string
  background: string
  teacherNotes: string
  product: string
  firstInquiry: boolean
  explicitPriceFollowup: boolean
  nextStep: string
  basicSituation: string
  resumeText: string
  goal: string
  concern: string
  duration: string
  focus: string
}

export type Analysis = {
  student_type: string
  current_stage: string
  core_need: string
  missing_information: string[]
  risk_flags: string[]
  reply_goal: string
  manual_review_required: boolean
  manual_review_reason: string
  product_fit?: string
  quote_status?: string
  service_scope?: string
  key_limits?: string[]
}

export type Result = {
  task_mode: TaskMode
  internal_analysis: Analysis
  recommended_reply: string
  facts_used: string[]
  uncertain_items: string[]
  demo_mode: boolean
  request_id: string
  locked_snapshot?: string
}
