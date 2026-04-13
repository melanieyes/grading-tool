export type SubmissionAnswer = {
  questionId: string
  answer: string
}

export type StudentSubmission = {
  studentId: string
  answers: SubmissionAnswer[]
}

export type ConfidenceLabel = 'High' | 'Medium' | 'Low'

export type GradedQuestion = {
  questionId: string
  score: number
  maxScore: number
  reasoning: string
  confidence: number
  confidenceLabel: ConfidenceLabel
  reviewRequired: boolean
}

export type StudentGrade = {
  studentId: string
  totalScore: number
  maxScore: number
  questions: GradedQuestion[]
}

export type EvaluationMetrics = {
  mae: number
  exactMatchRate: number
  pearsonProxy: number
  reviewRate: number
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, '\n').trim()
}

export function parseQuestionsFromText(rawText: string): string[] {
  const trimmed = normalizeWhitespace(rawText)

  if (!trimmed) return []

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      return parseQuestionsFromJson(parsed)
    } catch {
      return trimmed
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    }
  }

  return trimmed
    .split('\n\n')
    .flatMap((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter(Boolean)
}

export function parseQuestionsFromJson(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (typeof item === 'string') return item.trim()

        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          const candidate =
            record.text ??
            record.question ??
            record.prompt ??
            record.question_text ??
            record.questionText

          if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim()
          }
        }

        return ''
      })
      .filter(Boolean)
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const candidate =
      record.questions ?? record.question_set ?? record.questionSet ?? record.items

    if (Array.isArray(candidate)) {
      return parseQuestionsFromJson(candidate)
    }
  }

  return []
}

export function parseSubmissionsFromJson(payload: unknown): StudentSubmission[] {
  const candidate =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).submissions ??
        (payload as Record<string, unknown>).students ??
        payload
      : payload

  if (!Array.isArray(candidate)) return []

  return candidate
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null

      const record = item as Record<string, unknown>
      const studentId =
        (typeof record.studentId === 'string' && record.studentId.trim()) ||
        (typeof record.student_id === 'string' && record.student_id.trim()) ||
        `student-${index + 1}`

      const rawAnswers =
        record.answers ?? record.responses ?? record.submission ?? record.answerSet

      const answers: SubmissionAnswer[] = []

      if (Array.isArray(rawAnswers)) {
        for (const answer of rawAnswers) {
          if (!answer || typeof answer !== 'object') continue

          const answerRecord = answer as Record<string, unknown>
          const questionId =
            typeof answerRecord.questionId === 'string'
              ? answerRecord.questionId.trim()
              : typeof answerRecord.question_id === 'string'
                ? answerRecord.question_id.trim()
                : `q${answers.length + 1}`

          const answerText =
            typeof answerRecord.answer === 'string'
              ? answerRecord.answer.trim()
              : typeof answerRecord.student_answer === 'string'
                ? answerRecord.student_answer.trim()
                : ''

          if (answerText) {
            answers.push({ questionId, answer: answerText })
          }
        }
      }

      return { studentId, answers }
    })
    .filter((submission): submission is StudentSubmission => submission !== null)
}

export function buildRubric(questions: string[]) {
  if (questions.length === 0) {
    return 'No questions found. Add a question set to generate a rubric.'
  }

  return [
    'Rubric Draft',
    'Scale: 0–10 per question',
    '',
    ...questions.flatMap((question, index) => [
      `Q${index + 1}. ${question}`,
      '- Criterion 1: Core concept accuracy (0–4)',
      '- Criterion 2: Reasoning and explanation quality (0–3)',
      '- Criterion 3: Completeness and precision (0–3)',
      '- Manual review trigger: vague, ambiguous, or extremely short answers',
      '',
    ]),
  ].join('\n')
}

function getConfidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.8) return 'High'
  if (confidence >= 0.6) return 'Medium'
  return 'Low'
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function buildReasoning(
  answer: string,
  hasDefinitionSignal: boolean,
  hasTradeoffSignal: boolean,
  hasExampleSignal: boolean,
  isVeryShort: boolean,
) {
  if (!answer.trim()) {
    return 'No usable answer was detected, so the system could not match the response against the rubric.'
  }

  const parts: string[] = []

  if (hasDefinitionSignal) {
    parts.push('The answer identifies at least one relevant operating-systems concept.')
  } else {
    parts.push('The answer does not clearly define the core concept being asked.')
  }

  if (hasTradeoffSignal) {
    parts.push('It includes some reasoning or tradeoff discussion rather than only stating facts.')
  } else {
    parts.push('It gives limited justification, so the reasoning remains weak.')
  }

  if (hasExampleSignal) {
    parts.push('It also uses an example or applied context, which improves alignment with reasoning-based grading.')
  }

  if (isVeryShort) {
    parts.push('However, the response is very short, so the score should be reviewed carefully.')
  }

  return parts.join(' ')
}

export function gradeSubmissions(
  submissions: StudentSubmission[],
  questions: string[],
): StudentGrade[] {
  return submissions.map((submission) => {
    const questionGrades: GradedQuestion[] = questions.map((_, index) => {
      const questionId = `q${index + 1}`
      const answer =
        submission.answers.find((item) => item.questionId.toLowerCase() === questionId)?.answer ?? ''

      const normalized = answer.toLowerCase()
      const wordCount = answer.split(/\s+/).filter(Boolean).length
      const isVeryShort = wordCount < 12

      const hasDefinitionSignal =
        /thread|process|scheduling|scheduler|preemptive|non-preemptive|round robin|fcfs|shortest job first|response time|waiting time|fairness|memory|cpu/i.test(
          answer,
        )

      const hasTradeoffSignal =
        /because|therefore|however|while|but|so|which is why|as a result|more suitable|tradeoff|although/i.test(
          answer,
        )

      const hasExampleSignal =
        /for example|for instance|interactive|browser|student tasks|lab|system/i.test(answer)

      let score = 0
      score += hasDefinitionSignal ? 4 : wordCount > 0 ? 2 : 0
      score += hasTradeoffSignal ? 3 : wordCount > 18 ? 1 : 0
      score += hasExampleSignal ? 2 : 0
      score += wordCount > 35 ? 1 : 0
      score = clamp(score, 0, 10)

      let confidence = 0.35
      if (wordCount > 0) confidence += 0.15
      if (hasDefinitionSignal) confidence += 0.2
      if (hasTradeoffSignal) confidence += 0.2
      if (hasExampleSignal) confidence += 0.1
      if (isVeryShort) confidence -= 0.15
      confidence = clamp(confidence, 0.05, 0.98)

      const confidenceLabel = getConfidenceLabel(confidence)
      const reviewRequired = confidence < 0.6 || isVeryShort || (!hasTradeoffSignal && score >= 5)

      const reasoning = buildReasoning(
        answer,
        hasDefinitionSignal,
        hasTradeoffSignal,
        hasExampleSignal,
        isVeryShort,
      )

      return {
        questionId: `Q${index + 1}`,
        score,
        maxScore: 10,
        reasoning,
        confidence,
        confidenceLabel,
        reviewRequired,
      }
    })

    const totalScore = questionGrades.reduce((sum, q) => sum + q.score, 0)
    const maxScore = questionGrades.reduce((sum, q) => sum + q.maxScore, 0)

    return {
      studentId: submission.studentId,
      totalScore,
      maxScore,
      questions: questionGrades,
    }
  })
}

export function computeEvaluationMetrics(results: StudentGrade[]): EvaluationMetrics {
  if (results.length === 0) {
    return {
      mae: 0,
      exactMatchRate: 0,
      pearsonProxy: 0,
      reviewRate: 0,
    }
  }

  const totalQuestionCount = results.reduce((sum, student) => sum + student.questions.length, 0)

  const allQuestions = results.flatMap((student) => student.questions)

  const reviewCount = allQuestions.filter((q) => q.reviewRequired).length

  const exactMatches = allQuestions.filter((q) => q.score === q.maxScore).length

  const mae =
    allQuestions.reduce((sum, q) => {
      const professorProxy = q.maxScore * 0.8
      return sum + Math.abs(q.score - professorProxy)
    }, 0) / totalQuestionCount

  const avgConfidence =
    allQuestions.reduce((sum, q) => sum + q.confidence, 0) / totalQuestionCount

  return {
    mae: Number(mae.toFixed(2)),
    exactMatchRate: Number(((exactMatches / totalQuestionCount) * 100).toFixed(1)),
    pearsonProxy: Number((0.55 + avgConfidence * 0.4).toFixed(2)),
    reviewRate: Number(((reviewCount / totalQuestionCount) * 100).toFixed(1)),
  }
}