"""Auto-classify question sentiment based on text content."""

from __future__ import annotations

def classify_sentiment(text: str) -> str:
    """Return a sentiment tag for a connections question.

    Tags: warm, secretive, reflective, tension, vulnerable, loyal.
    Uses phrase matching — reflective is the default fallback.
    """
    t = text.lower()

    # Tension: conflict, criticism, negative judgment
    if _any_in(t, [
        "annoy", "let you down", "let them down", "argue", "weakness",
        "wrong", "worst", "disagree", "conflict", "frustrat",
    ]):
        return "tension"

    # Vulnerable: emotional exposure, grief, fear about self
    if _any_in(t, [
        "wish they understood", "wish you understood", "worry about",
        "forgive", "funeral", "miss most", "miss the most",
        "regret", "guilt", "ashamed", "afraid of losing",
    ]):
        return "vulnerable"

    # Loyal: self-sacrifice, devotion, duty
    if _any_in(t, [
        "mortal danger", "risk your life", "die for", "protect them",
        "promise", "owe", "repay", "defend",
    ]):
        return "loyal"

    # Secretive: hidden knowledge, unspoken things
    if _any_in(t, [
        "secret", "hiding", "confide", "never bring up", "never tell",
        "never say", "pretend not", "nobody else", "no one else", "unspoken",
    ]):
        return "secretive"

    # Warm: affection, admiration, positive memories
    if _any_in(t, [
        "brave", "nicest", "kindest", "smile", "endearing", "learn",
        "taught", "surprise", "admire", "respect", "grateful",
        "inspire", "fondest", "favorite memory", "best thing",
    ]):
        return "warm"

    return "reflective"


def _any_in(text: str, phrases: list[str]) -> bool:
    return any(p in text for p in phrases)
