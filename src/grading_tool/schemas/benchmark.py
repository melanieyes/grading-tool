from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel


class Criterion(BaseModel):
    criterion_id: str
    points: float
    description: str


class SubpartRubric(BaseModel):
    part_id: str
    correct_answer: Optional[str] = None
    total_points: float
    criteria: List[Criterion]


class QuestionRubric(BaseModel):
    question_id: str
    benchmark_type: str
    total_points: float
    grading_note: Optional[str] = None
    subparts: Optional[List[SubpartRubric]] = None
    criteria: Optional[List[Criterion]] = None


class RubricFile(BaseModel):
    course: str
    term: str
    exam: str
    rubric_version: str
    rubric_notes: Optional[str] = None
    questions: List[QuestionRubric]


class QuestionSubpart(BaseModel):
    part_id: str
    question_text: str


class QuestionSpec(BaseModel):
    question_id: str
    points: float
    benchmark_type: str
    question_text: str
    subparts: Optional[List[QuestionSubpart]] = None


class QuestionFile(BaseModel):
    course: str
    term: str
    exam: str
    duration_minutes: int
    total_points: float
    benchmark_notes: dict
    questions: List[QuestionSpec]


class StudentAnswer(BaseModel):
    question_id: str
    student_answer: str


class StudentSubmission(BaseModel):
    student_id: str
    answers: List[StudentAnswer]


class StudentAnswersFile(BaseModel):
    __root__: List[StudentSubmission]


class ProfessorGradeItem(BaseModel):
    question_id: str
    score: float
    score_max: float
    note: Optional[str] = None


class ProfessorGradeEntry(BaseModel):
    student_id: str
    grades: List[ProfessorGradeItem]


class ProfessorGradesFile(BaseModel):
    __root__: List[ProfessorGradeEntry]


class BenchmarkManifest(BaseModel):
    """
    Portable benchmark descriptor for course/exam reuse.

    All file paths can be relative to benchmark_dir or absolute.
    """

    course_id: str
    exam_id: str
    question_path: str
    rubric_path: str
    solutions_path: str
    student_answers_paths: List[str]
    professor_grade_path: Optional[str] = None
    prompt_name: Optional[str] = None