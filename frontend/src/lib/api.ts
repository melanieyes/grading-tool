const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

function getApiBase() {
  const saved = localStorage.getItem('backend_api_base_url')
  return saved?.trim() ? saved.trim().replace(/\/$/, '') : DEFAULT_API_BASE
}

function buildHeaders(extra?: Record<string, string>, apiKey?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra ?? {}),
  }

  const cleanedKey = apiKey?.trim()
  if (cleanedKey) headers['X-Gemini-Api-Key'] = cleanedKey

  return headers
}

async function fetchJson(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, init)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Request failed (${response.status})`)
    }

    return await response.json()
  } catch (error: any) {
    const message = String(error?.message || '')
    if (message.toLowerCase().includes('failed to fetch')) {
      const base = getApiBase()
      throw new Error(
        `Failed to fetch. Backend not reachable at ${base}. ` +
          `Start the backend (port 8000) or update localStorage key backend_api_base_url.`
      )
    }
    throw error
  }
}

type Submission = {
  student_id: string
  answer: string
  question_id?: string
}

export async function gradeBatch(
  submissions: Submission[],
  opts?: { apiKey?: string },
) {
  const url = `${getApiBase()}/api/grade-batch`
  return await fetchJson(url, {
    method: 'POST',
    headers: {
      ...buildHeaders(undefined, opts?.apiKey),
    },
    body: JSON.stringify({
      submissions,
    }),
  })
}

export type EvaluationRunRequest = {
  ai_results: Array<{
    student_id: string
    question_id: string
    score: number
    max_score: number
    confidence?: number
    review_required?: boolean
    review_reason?: string
    reasoning?: string
  }>
  professor_grades: Array<{
    student_id: string
    question_id: string
    score: number
    max_score?: number
    comment?: string
  }>
  difference_threshold?: number
  include_semantic_metrics?: boolean
}

export async function runEvaluation(
  payload: EvaluationRunRequest,
  opts?: { apiKey?: string },
) {
  const url = `${getApiBase()}/api/evaluation/run`
  return await fetchJson(url, {
    method: 'POST',
    headers: {
      ...buildHeaders(undefined, opts?.apiKey),
    },
    body: JSON.stringify(payload),
  })
}

export type CalibrationRequest = {
  question_id: string
  question_text?: string | null
  original_rubric: any
  solution?: string | null
  submissions: Array<{ student_id: string; answer: string; question_id?: string }>
  professor_grades: Array<{
    student_id: string
    score: number
    max_score?: number
    comment?: string
    question_id?: string
  }>
  max_rounds?: number
  difference_threshold?: number
  target_mse?: number | null
  min_improvement?: number
  include_semantic_metrics?: boolean
}

export async function runCalibration(
  payload: CalibrationRequest,
  opts?: { apiKey?: string },
) {
  const url = `${getApiBase()}/api/evaluation/calibrate`
  return await fetchJson(url, {
    method: 'POST',
    headers: {
      ...buildHeaders(undefined, opts?.apiKey),
    },
    body: JSON.stringify(payload),
  })
}

export function loadApiSettings() {
  // Security: never persist API keys in browser storage.
  // If an older build saved one, remove it now.
  if (localStorage.getItem('gemini_api_key')) {
    localStorage.removeItem('gemini_api_key')
  }

  return {
    backend_api_base_url: getApiBase(),
    gemini_api_key: '',
  }
}

export function saveApiSettings(settings: {
  backend_api_base_url?: string
}) {
  if (typeof settings.backend_api_base_url === 'string') {
    const cleaned = settings.backend_api_base_url.trim().replace(/\/$/, '')
    if (cleaned) {
      localStorage.setItem('backend_api_base_url', cleaned)
    } else {
      localStorage.removeItem('backend_api_base_url')
    }
  }
}