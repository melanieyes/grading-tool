from src.grading_tool.utils.io import load_json


def test_load_question_file():
    data = load_json("data/benchmarks/cs302_final_fall2025/question_final.json")
    assert "questions" in data
    assert len(data["questions"]) > 0