export type PromptRun = {
  id: string
  name: string
  prompt: string
  model: string
  questionCount: number
  studentCount: number
  exactMatch: number
  meanAbsoluteError: number
  createdAt: string
}

export type QuestionMetric = {
  questionId: string
  exactMatch: number
  meanAbsoluteError: number
  avgProfessorScore: number
  avgModelScore: number
}

export type StudentGrade = {
  studentId: string
  totalProfessorScore: number
  totalModelScore: number
  absoluteError: number
}
