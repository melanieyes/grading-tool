from __future__ import annotations

import math
from typing import Sequence

import numpy as np


def mean_absolute_error(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    if not y_true:
        return 0.0
    return sum(abs(a - b) for a, b in zip(y_true, y_pred)) / len(y_true)


def mean_squared_error(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    if not y_true:
        return 0.0
    return sum((a - b) ** 2 for a, b in zip(y_true, y_pred)) / len(y_true)


def exact_match_rate(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    if not y_true:
        return 0.0
    return sum(1 for a, b in zip(y_true, y_pred) if a == b) / len(y_true)


def pearson_corr(x: Sequence[float], y: Sequence[float]) -> float:
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


def rankdata(values: Sequence[float]) -> list[float]:
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


def spearman_corr(x: Sequence[float], y: Sequence[float]) -> float:
    return pearson_corr(rankdata(x), rankdata(y))


def cosine_similarity_score(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    denom = float(np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
    if denom == 0.0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / denom)


def average_cosine_similarity(
    references: Sequence[str],
    predictions: Sequence[str],
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
) -> float:
    """
    Average cosine similarity over paired texts using sentence embeddings.

    Requires:
        pip install sentence-transformers
    """
    if not references:
        return 0.0
    if len(references) != len(predictions):
        raise ValueError("references and predictions must have the same length")

    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as e:
        raise ImportError(
            "sentence-transformers is required for cosine similarity. "
            "Install with: pip install sentence-transformers"
        ) from e

    model = SentenceTransformer(model_name)
    ref_emb = model.encode(list(references), convert_to_numpy=True, normalize_embeddings=False)
    pred_emb = model.encode(list(predictions), convert_to_numpy=True, normalize_embeddings=False)

    scores = [
        cosine_similarity_score(r, p)
        for r, p in zip(ref_emb, pred_emb)
    ]
    return float(sum(scores) / len(scores))


def bertscore_f1(
    references: Sequence[str],
    predictions: Sequence[str],
    lang: str = "en",
    model_type: str | None = None,
) -> float:
    """
    Average BERTScore F1 over paired texts.

    Requires:
        pip install bert-score torch
    """
    if not references:
        return 0.0
    if len(references) != len(predictions):
        raise ValueError("references and predictions must have the same length")

    try:
        from bert_score import score as bert_score
    except ImportError as e:
        raise ImportError(
            "bert-score is required for BERTScore. "
            "Install with: pip install bert-score torch"
        ) from e

    _, _, f1 = bert_score(
        cands=list(predictions),
        refs=list(references),
        lang=lang,
        model_type=model_type,
        verbose=False,
    )
    return float(f1.mean().item())