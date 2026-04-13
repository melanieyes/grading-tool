const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

type Submission = {
  student_id: string
  answer: string
}

export async function gradeBatch(submissions: Submission[]) {
  const response = await fetch(`${API_BASE}/api/grade-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      submissions,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Batch grading failed')
  }

  return await response.json()
}