const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export async function fetchPromptRuns() {
  console.log('API_BASE =', API_BASE)
  console.log('Calling =', `${API_BASE}/api/runs`)

  const response = await fetch(`${API_BASE}/api/runs`)

  console.log('Response status =', response.status)

  if (!response.ok) {
    throw new Error(`Failed to load runs: ${response.status}`)
  }

  const data = await response.json()
  console.log('Response data =', data)

  return data
}