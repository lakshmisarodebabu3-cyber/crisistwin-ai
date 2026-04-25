"""
CrisisTwin AI - Disaster Spread Simulation Engine (Digital Twin)
Generates time-step data for how a disaster zone expands over time.
Used to power the animated flood/fire spread visualization.
"""

import math
import random


def get_simulation_step(center_lat: float, center_lng: float,
                         base_radius_km: float, step: int) -> dict:
    """
    Compute the disaster spread state at a given simulation time step.

    Models:
    - Radius grows non-linearly (fast at first, slowing down)
    - Spread points are randomized around the perimeter for realistic shape
    - Risk zones are concentric: core (critical), mid (danger), outer (warning)

    Args:
        center_lat:     Epicenter latitude
        center_lng:     Epicenter longitude
        base_radius_km: Initial disaster radius in km
        step:           Simulation step (0 = initial, max 20)

    Returns:
        Dict with simulation state for this time step
    """
    step = max(0, min(20, step))

    # Non-linear radius growth: fast initial spread, slowing down
    growth_factor = 1 + (step * 0.15) + (step ** 1.3) * 0.02
    current_radius_km = base_radius_km * growth_factor

    # Convert km to approximate degrees (rough, good enough for sim)
    km_per_degree_lat = 111.0
    km_per_degree_lng = 111.0 * math.cos(math.radians(center_lat))

    radius_lat = current_radius_km / km_per_degree_lat
    radius_lng = current_radius_km / km_per_degree_lng

    # Generate perimeter points (polygon approximation of spread zone)
    num_points = 24
    spread_polygon = []
    rng = random.Random(step * 7 + 42)  # seeded for reproducibility

    for i in range(num_points):
        angle = (2 * math.pi * i) / num_points
        # Randomize radius slightly for organic shape
        r_variation = rng.uniform(0.75, 1.25)
        pt_lat = center_lat + math.sin(angle) * radius_lat * r_variation
        pt_lng = center_lng + math.cos(angle) * radius_lng * r_variation
        spread_polygon.append({"lat": round(pt_lat, 6), "lng": round(pt_lng, 6)})

    # Core danger zone (inner 40%)
    core_polygon = []
    core_radius_lat = radius_lat * 0.4
    core_radius_lng = radius_lng * 0.4
    for i in range(num_points):
        angle = (2 * math.pi * i) / num_points
        r_variation = rng.uniform(0.85, 1.15)
        pt_lat = center_lat + math.sin(angle) * core_radius_lat * r_variation
        pt_lng = center_lng + math.cos(angle) * core_radius_lng * r_variation
        core_polygon.append({"lat": round(pt_lat, 6), "lng": round(pt_lng, 6)})

    # Affected population estimate (rough mock)
    affected_estimate = int(500 * (current_radius_km ** 1.8))

    # Risk intensity drops with step beyond 10 (response teams arriving)
    containment_factor = max(0, (step - 10) * 0.05)
    intensity = round(max(0.1, 1.0 - containment_factor), 2)

    return {
        "step": step,
        "center": {"lat": center_lat, "lng": center_lng},
        "radius_km": round(current_radius_km, 3),
        "intensity": intensity,
        "spread_polygon": spread_polygon,
        "core_polygon": core_polygon,
        "affected_estimate": affected_estimate,
        "is_contained": step >= 15,
        "status_label": _get_status_label(step),
        "evacuation_radius_km": round(current_radius_km * 1.5, 3),
    }


def _get_status_label(step: int) -> str:
    """Return human-readable status for this simulation step."""
    if step == 0:
        return "Incident Reported"
    elif step <= 3:
        return "Rapid Spread — EVACUATE"
    elif step <= 7:
        return "Active Expansion — Response Deployed"
    elif step <= 12:
        return "Spreading — Containment Efforts"
    elif step <= 15:
        return "Slowing — Partial Containment"
    else:
        return "Contained — Recovery Phase"