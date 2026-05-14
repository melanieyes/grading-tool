import * as midterm1 from './midterm1-slice'
import * as midterm1Q3 from './midterm1-q3-slice'
import * as finalQ7 from './final-q7-slice'

export type DemoSlice = {
  id: string
  label: string
  questions: typeof midterm1.demoQuestions
  rubrics: Record<string, string>
  submissions: string
  professorGrades: string
}

export const demoSlices: DemoSlice[] = [
  {
    id: 'midterm1',
    label: 'Midterm 1 — 3 questions × 3 students',
    questions: midterm1.demoQuestions,
    rubrics: midterm1.demoRubrics,
    submissions: midterm1.demoSubmissions,
    professorGrades: midterm1.demoProfessorGrades,
  },
  {
    id: 'final-q7',
    label: 'Final q7 — polynomial reduction × 3 students',
    questions: finalQ7.demoQuestions,
    rubrics: finalQ7.demoRubrics,
    submissions: finalQ7.demoSubmissions,
    professorGrades: finalQ7.demoProfessorGrades,
  },
  {
    id: 'midterm1-q3',
    label: 'Midterm 1 q3 — algorithm design techniques × 10 students',
    questions: midterm1Q3.demoQuestions,
    rubrics: midterm1Q3.demoRubrics,
    submissions: midterm1Q3.demoSubmissions,
    professorGrades: midterm1Q3.demoProfessorGrades,
  },
]
