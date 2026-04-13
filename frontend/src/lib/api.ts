import type { PromptRun } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

// Minimal API example so replacing mock data later is straightforward.
export async function fetchPromptRuns(): Promise<PromptRun[]> {
  const response = await fetch(`${API_BASE}/api/runs`)

  if (!response.ok) {
    throw new Error(`Failed to load runs: ${response.status}`)
  }

  return (await response.json()) as PromptRun[]
}
