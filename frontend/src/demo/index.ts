import * as midterm1 from './midterm1-slice'
import * as finalQ7 from './final-q7-slice'

export type DemoSlice = {
  id: string
  label: string
  description: string
  questions: typeof midterm1.demoQuestions
  rubrics: Record<string, string>
  submissions: string
  professorGrades: string
}

export const demoSlices: DemoSlice[] = [
  {
    id: 'midterm1',
    label: 'Midterm 1 — 3 questions × 3 students',
    description: 'Algorithm design / analysis (q3, q4i, q6). ~9 grading calls, finishes in ~1 min.',
    questions: midterm1.demoQuestions,
    rubrics: midterm1.demoRubrics,
    submissions: midterm1.demoSubmissions,
    professorGrades: midterm1.demoProfessorGrades,
  },
  {
    id: 'final-q7',
    label: 'Final q7 — polynomial reduction × 3 students',
    description: 'The "one-directional under-credit" calibration case. 3 grading calls, ~15s.',
    questions: finalQ7.demoQuestions,
    rubrics: finalQ7.demoRubrics,
    submissions: finalQ7.demoSubmissions,
    professorGrades: finalQ7.demoProfessorGrades,
  },
]
