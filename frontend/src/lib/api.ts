const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function gradeBatch(submissions: {
  student_id: string
  answer: string
}[]) {
  const response = await fetch(`${API_BASE}/api/grade-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ submissions }),
  })

  if (!response.ok) {
    throw new Error('Batch grading failed')
  }

  return await response.json()
}