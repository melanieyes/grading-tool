def lang_a(s: str) -> bool:
    return len(s) >= 2 and s[0] == "a" and s[-1] == "b"


def lang_b(s: str) -> bool:
    return s.count("a") == 2


def lang_c(s: str) -> bool:
    return s.count("b") >= 2


def lang_d(s: str) -> bool:
    return s.count("a") == 2 and s.count("b") >= 2


def lang_e(s: str) -> bool:
    return all(s[i] == "b" for i in range(0, len(s), 2))


def lang_f(s: str) -> bool:
    return s not in {"aa", "aba"}


def lang_g(s: str) -> bool:
    return "ab" not in s and "ba" not in s


def lang_h(s: str) -> bool:
    return len(s) % 2 == 0 and s.count("a") % 2 == 1


LANGUAGE_SPECS = {
    "a": lang_a,
    "b": lang_b,
    "c": lang_c,
    "d": lang_d,
    "e": lang_e,
    "f": lang_f,
    "g": lang_g,
    "h": lang_h,
}