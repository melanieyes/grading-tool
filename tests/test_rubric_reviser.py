from src.grading_tool.grading.rubric_reviser import revise_rubric


def test_revise_rubric_injects_grading_note_blocks_and_dedupes():
    rubric = {
        "criteria": [
            {"id": "c1", "description": "Mentions deadlock", "points": 5},
            {"id": "c2", "description": "Mentions prevention", "points": 5},
        ],
        "grading_note": "Base note.",
    }

    mistake_stats = {
        "common_mistakes": [
            {
                "tag": "ai_overscoring",
                "count": 3,
                "percentage": 1.0,
                "description": "AI too high",
                "avg_diff": 9.0,
                "affected_students": ["001", "002", "003"],
            }
        ]
    }

    out1 = revise_rubric(
        original_rubric=rubric,
        mistake_stats=mistake_stats,
        flagged_cases=[{"student_id": "001", "difference": 9.0}],
        instructor_note=None,
        round_index=1,
    )
    assert out1["revision_needed"] is True
    note1 = out1["revised_rubric"]["grading_note"]
    assert "CALIBRATION NOTE" in note1
    assert "RUBRIC REVISION NOTES" in note1
    assert "Base note." in note1

    out2 = revise_rubric(
        original_rubric=out1["revised_rubric"],
        mistake_stats=mistake_stats,
        flagged_cases=[{"student_id": "001", "difference": 9.0}],
        instructor_note=None,
        round_index=2,
    )
    note2 = out2["revised_rubric"]["grading_note"]
    assert note2.count("CALIBRATION NOTE") == 1
    assert note2.count("RUBRIC REVISION NOTES") == 1
