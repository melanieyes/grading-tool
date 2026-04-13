import type { PromptRun, QuestionMetric, StudentGrade } from './types'

export const promptRuns: PromptRun[] = [
  {
    id: 'run-debug-v2',
    name: 'Debug Prompt v2',
    prompt: 'prompt_v2',
    model: 'gemini-2.5-pro',
    questionCount: 3,
    studentCount: 1,
    exactMatch: 66.7,
    meanAbsoluteError: 0.42,
    createdAt: '2026-04-10 14:32',
  },
  {
    id: 'run-debug-v3',
    name: 'Debug Prompt v3',
    prompt: 'prompt_v3',
    model: 'gemini-2.5-pro',
    questionCount: 8,
    studentCount: 5,
    exactMatch: 78.1,
    meanAbsoluteError: 0.29,
    createdAt: '2026-04-11 09:18',
  },
  {
    id: 'run-student001-v3',
    name: 'Student001 Full Exam',
    prompt: 'prompt_v3',
    model: 'gemini-2.5-pro',
    questionCount: 10,
    studentCount: 1,
    exactMatch: 81.4,
    meanAbsoluteError: 0.21,
    createdAt: '2026-04-12 17:06',
  },
]

export const questionMetricsByRun: Record<string, QuestionMetric[]> = {
  'run-debug-v2': [
    {
      questionId: 'q1',
      exactMatch: 100,
      meanAbsoluteError: 0,
      avgProfessorScore: 8,
      avgModelScore: 8,
    },
    {
      questionId: 'q2',
      exactMatch: 0,
      meanAbsoluteError: 0.75,
      avgProfessorScore: 6,
      avgModelScore: 5.25,
    },
    {
      questionId: 'q3',
      exactMatch: 100,
      meanAbsoluteError: 0,
      avgProfessorScore: 7,
      avgModelScore: 7,
    },
  ],
  'run-debug-v3': [
    {
      questionId: 'q3',
      exactMatch: 80,
      meanAbsoluteError: 0.4,
      avgProfessorScore: 6.8,
      avgModelScore: 6.6,
    },
    {
      questionId: 'q7',
      exactMatch: 76,
      meanAbsoluteError: 0.25,
      avgProfessorScore: 9.1,
      avgModelScore: 9.0,
    },
    {
      questionId: 'q8',
      exactMatch: 72,
      meanAbsoluteError: 0.31,
      avgProfessorScore: 5.5,
      avgModelScore: 5.3,
    },
  ],
  'run-student001-v3': [
    {
      questionId: 'q1',
      exactMatch: 100,
      meanAbsoluteError: 0,
      avgProfessorScore: 8,
      avgModelScore: 8,
    },
    {
      questionId: 'q2',
      exactMatch: 100,
      meanAbsoluteError: 0,
      avgProfessorScore: 7,
      avgModelScore: 7,
    },
    {
      questionId: 'q3',
      exactMatch: 100,
      meanAbsoluteError: 0,
      avgProfessorScore: 8,
      avgModelScore: 8,
    },
  ],
}

export const studentGradesByRun: Record<string, StudentGrade[]> = {
  'run-debug-v2': [
    {
      studentId: 'student001',
      totalProfessorScore: 21,
      totalModelScore: 20.25,
      absoluteError: 0.75,
    },
  ],
  'run-debug-v3': [
    {
      studentId: 'student001',
      totalProfessorScore: 63,
      totalModelScore: 62.5,
      absoluteError: 0.5,
    },
    {
      studentId: 'student002',
      totalProfessorScore: 59,
      totalModelScore: 58.5,
      absoluteError: 0.5,
    },
    {
      studentId: 'student003',
      totalProfessorScore: 66,
      totalModelScore: 66,
      absoluteError: 0,
    },
  ],
  'run-student001-v3': [
    {
      studentId: 'student001',
      totalProfessorScore: 81,
      totalModelScore: 80.8,
      absoluteError: 0.2,
    },
  ],
}
