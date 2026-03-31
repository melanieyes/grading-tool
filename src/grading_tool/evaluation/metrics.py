from __future__ import annotations

import math


def mean_absolute_error(y_true: list[float], y_pred: list[float]) -> float:
    if not y_true:
        return 0.0
    return sum(abs(a - b) for a, b in zip(y_true, y_pred)) / len(y_true)


def exact_match_rate(y_true: list[float], y_pred: list[float]) -> float:
    if not y_true:
        return 0.0
    return sum(1 for a, b in zip(y_true, y_pred) if a == b) / len(y_true)


def pearson_corr(x: list[float], y: list[float]) -> float:
    n = len(x)
    if n == 0:
        return 0.0

    mean_x = sum(x) / n
    mean_y = sum(y) / n

    num = sum((a - mean_x) * (b - mean_y) for a, b in zip(x, y))
    den_x = math.sqrt(sum((a - mean_x) ** 2 for a in x))
    den_y = math.sqrt(sum((b - mean_y) ** 2 for b in y))

    if den_x == 0 or den_y == 0:
        return 0.0

    return num / (den_x * den_y)


def rankdata(values: list[float]) -> list[float]:
    sorted_pairs = sorted((v, i) for i, v in enumerate(values))
    ranks = [0.0] * len(values)

    rank = 1
    i = 0
    while i < len(sorted_pairs):
        j = i
        while j < len(sorted_pairs) and sorted_pairs[j][0] == sorted_pairs[i][0]:
            j += 1

        avg_rank = (rank + rank + (j - i) - 1) / 2
        for k in range(i, j):
            _, idx = sorted_pairs[k]
            ranks[idx] = avg_rank

        rank += j - i
        i = j

    return ranks


def spearman_corr(x: list[float], y: list[float]) -> float:
    return pearson_corr(rankdata(x), rankdata(y))