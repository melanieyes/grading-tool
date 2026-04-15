from typing import List

from app.schemas.api_models import (
	BatchGradeResponse,
	GradeRequest,
	GradeResult,
	ReviewQueueItem,
)


def score_answer(student_id: str, answer: str, question_id: str = "Q1") -> GradeResult:
	text = answer.lower()

	score = 5
	confidence = 0.65
	reasoning = "Partial answer detected."
	review_required = False
	review_reason = ""

	if "deadlock" in text:
		score += 2

	if "resource" in text or "circular wait" in text:
		score += 2

	if "prevent" in text or "ordering" in text:
		score += 1

	if len(text.split()) < 8:
		confidence = 0.52
		review_required = True
		review_reason = "Answer too short"

	if score >= 9:
		confidence = 0.90
		reasoning = "Strong answer with correct concepts and prevention strategy."
	elif score >= 7:
		confidence = 0.78
		reasoning = "Good answer but missing some detail."
		review_required = True
		review_reason = "Borderline score"
	else:
		confidence = 0.60
		review_required = True
		review_reason = "Low score"

	return GradeResult(
		student_id=student_id,
		question_id=question_id,
		score=score,
		max_score=10,
		confidence=confidence,
		review_required=review_required,
		review_reason=review_reason,
		reasoning=reasoning,
	)


def grade_batch(submissions: List[GradeRequest]) -> BatchGradeResponse:
	results = [score_answer(item.student_id, item.answer) for item in submissions]

	review_queue = [
		ReviewQueueItem(
			student_id=result.student_id,
			question_id=result.question_id,
			score=result.score,
			confidence=result.confidence,
			reason=result.review_reason,
		)
		for result in results
		if result.review_required
	]

	average_score = round(sum(result.score for result in results) / len(results), 2) if results else 0.0

	return BatchGradeResponse(
		count=len(results),
		average_score=average_score,
		review_count=len(review_queue),
		review_queue=review_queue,
		results=results,
	)
