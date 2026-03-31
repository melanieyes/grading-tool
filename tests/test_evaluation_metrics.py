from src.grading_tool.evaluation.metrics import mean_absolute_error, exact_match_rate


def test_mae():
    assert mean_absolute_error([1, 2, 3], [1, 3, 2]) == 2 / 3


def test_exact_match():
    assert exact_match_rate([1, 2, 3], [1, 2, 0]) == 2 / 3