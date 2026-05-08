"""Simple survey reviewer utilities used by graders.

This module provides a minimal `SurveyReviewer` class that summarizes
survey-style grading/checklist responses. It is intentionally lightweight
so tests and higher-level components can import it without heavy deps.
"""
from typing import Iterable, Mapping
import statistics


class SurveyReviewer:
    """Aggregate and summarize survey responses.

    A survey_response is expected to be an iterable of numeric values or
    a mapping of label -> numeric value.
    """

    def summarize(self, responses: Iterable[float]) -> Mapping[str, float]:
        """Return basic summary stats for numeric responses."""
        vals = list(responses)
        if not vals:
            return {"count": 0, "mean": 0.0, "stdev": 0.0}
        mean = statistics.mean(vals)
        stdev = statistics.pstdev(vals) if len(vals) > 1 else 0.0
        return {"count": len(vals), "mean": mean, "stdev": stdev}
