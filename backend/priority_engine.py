"""
CrisisTwin AI - Priority Classification Engine
Rule-based AI engine that classifies SOS alerts into HIGH / MEDIUM / LOW priority.
"""

# Disaster type base scores (higher = more dangerous)
DISASTER_TYPE_SCORES = {
    "fire":     10,
    "collapse": 9,
    "flood":    8,
    "medical":  7,
    "chemical": 10,
    "explosion":10,
    "tsunami":  10,
    "unknown":  5,
}

# Keywords in description that escalate priority
ESCALATION_KEYWORDS = [
    "trapped", "trapped", "children", "child", "baby", "hospital",
    "unconscious", "bleeding", "fire spreading", "many", "mass",
    "building", "school", "elderly", "can't breathe", "explosion",
    "collapse", "multiple", "50+", "20+", "10+", "dozens"
]

# Keywords that de-escalate priority
DEESCALATION_KEYWORDS = [
    "minor", "small", "single person", "manageable", "stable",
    "no injuries", "property only"
]


def classify_priority(alert: dict) -> str:
    """
    Classify an SOS alert into HIGH, MEDIUM, or LOW priority.

    Scoring:
    - Disaster type base score (1-10)
    - Severity hint from user (1-10)
    - Description keyword analysis (+/-)
    - Final weighted score maps to priority tier

    Args:
        alert: Dict with keys: disaster_type, severity_hint, description

    Returns:
        str: "HIGH", "MEDIUM", or "LOW"
    """
    disaster_type = alert.get("disaster_type", "unknown").lower()
    severity_hint = float(alert.get("severity_hint", 5))
    description = alert.get("description", "").lower()

    # Base score from disaster type
    type_score = DISASTER_TYPE_SCORES.get(disaster_type, 5)

    # Keyword analysis on description
    keyword_score = 0
    for kw in ESCALATION_KEYWORDS:
        if kw in description:
            keyword_score += 1.5

    for kw in DEESCALATION_KEYWORDS:
        if kw in description:
            keyword_score -= 1.0

    # Weighted final score (0-10 scale)
    final_score = (
        type_score * 0.35 +
        severity_hint * 0.45 +
        keyword_score * 0.20
    )

    # Clamp to valid range
    final_score = max(0, min(10, final_score))

    # Map to priority tier
    if final_score >= 7.5:
        return "HIGH"
    elif final_score >= 4.5:
        return "MEDIUM"
    else:
        return "LOW"


def get_priority_color(priority: str) -> str:
    """Return hex color for a given priority level."""
    colors = {
        "HIGH":   "#FF3B3B",
        "MEDIUM": "#FF9500",
        "LOW":    "#34C759",
    }
    return colors.get(priority, "#999999")


def get_priority_weight(priority: str) -> int:
    """Return numeric weight for sorting (higher = more urgent)."""
    weights = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}
    return weights.get(priority, 0)