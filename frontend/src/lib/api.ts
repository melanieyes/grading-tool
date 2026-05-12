type ApiSettings = {
  backend_api_base_url: string
}

type RequestOptions = {
  apiKey?: string
  apiBaseUrl?: string
}

type Submission = {
  student_id: string
  answer: string
  question_id?: string
}

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const SETTINGS_STORAGE_KEY = 'grading_tool.api_settings'

function normalizeBaseUrl(raw: unknown) {
  if (typeof raw !== 'string') return DEFAULT_API_BASE

  // Users sometimes paste multiple tokens or accidental suffixes.
  // Keep only the first token and trim whitespace.
  let url = raw.trim().split(/\s+/)[0] || ''

  // Fix common typo: "http//" or "https//" (missing colon).
  if (url.startsWith('http//')) url = url.replace(/^http\/\//, 'http://')
  if (url.startsWith('https//')) url = url.replace(/^https\/\//, 'https://')

  // Remove trailing slash to keep `${base}${path}` stable.
  url = url.replace(/\/+$/, '')

  if (!url) return DEFAULT_API_BASE
  if (!/^https?:\/\//.test(url)) return DEFAULT_API_BASE

  return url
}

export function loadApiSettings(): ApiSettings {
  if (typeof window === 'undefined') {
    return { backend_api_base_url: DEFAULT_API_BASE }
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { backend_api_base_url: DEFAULT_API_BASE }

    const parsed = JSON.parse(raw)
    return { backend_api_base_url: normalizeBaseUrl(parsed?.backend_api_base_url) }
  } catch {
    return { backend_api_base_url: DEFAULT_API_BASE }
  }
}

export function saveApiSettings(next: Partial<ApiSettings>) {
  if (typeof window === 'undefined') return

  const current = loadApiSettings()
  const merged: ApiSettings = {
    backend_api_base_url: normalizeBaseUrl(next.backend_api_base_url ?? current.backend_api_base_url),
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged))
}

function resolveApiBaseUrl(options?: RequestOptions) {
  if (options?.apiBaseUrl) return normalizeBaseUrl(options.apiBaseUrl)
  return normalizeBaseUrl(loadApiSettings().backend_api_base_url)
}

function buildHeaders(options?: RequestOptions) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options?.apiKey?.trim()) {
    // Backend may ignore this today, but it lets the UI pass user-provided keys safely.
    headers['X-API-Key'] = options.apiKey.trim()
  }

  return headers
}

async function postJson<TResponse>(path: string, payload: unknown, options?: RequestOptions): Promise<TResponse> {
  const apiBaseUrl = resolveApiBaseUrl(options)

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: buildHeaders(options),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }

  return (await response.json()) as TResponse
}

export async function gradeBatch(submissions: Submission[], options?: RequestOptions): Promise<any> {
  return await postJson<any>('/api/grade-batch', { submissions }, options)
}

export async function runEvaluation(payload: unknown, options?: RequestOptions): Promise<any> {
  return await postJson<any>('/api/evaluation/run', payload, options)
}

export async function runCalibration(payload: unknown, options?: RequestOptions): Promise<any> {
  return await postJson<any>('/api/evaluation/calibrate', payload, options)
}