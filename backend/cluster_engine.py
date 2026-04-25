"""
CrisisTwin AI - Cluster Detection Engine
Simple DBSCAN-style spatial clustering to identify critical zones
where multiple SOS alerts are concentrated.
"""

import math


def haversine(lat1, lon1, lat2, lon2):
    """Distance in km between two lat/lng points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def detect_clusters(alerts: list, eps_km: float = 0.8, min_points: int = 2) -> list:
    """
    Detect spatial clusters of SOS alerts using a simplified DBSCAN approach.

    Args:
        alerts:     List of active alert dicts (must have lat, lng, priority)
        eps_km:     Max distance in km for two points to be in same cluster
        min_points: Minimum alerts to form a cluster

    Returns:
        List of cluster dicts: { center_lat, center_lng, count, alerts, risk_level }
    """
    if not alerts:
        return []

    n = len(alerts)
    visited = [False] * n
    cluster_ids = [-1] * n  # -1 = noise
    current_cluster = 0

    def get_neighbors(idx):
        neighbors = []
        for j in range(n):
            if j != idx:
                d = haversine(
                    alerts[idx]["lat"], alerts[idx]["lng"],
                    alerts[j]["lat"],  alerts[j]["lng"]
                )
                if d <= eps_km:
                    neighbors.append(j)
        return neighbors

    # DBSCAN core loop
    for i in range(n):
        if visited[i]:
            continue
        visited[i] = True
        neighbors = get_neighbors(i)

        if len(neighbors) < min_points - 1:
            # Mark as noise (may be absorbed later)
            cluster_ids[i] = -1
        else:
            cluster_ids[i] = current_cluster
            seed_set = list(neighbors)

            while seed_set:
                j = seed_set.pop(0)
                if not visited[j]:
                    visited[j] = True
                    new_neighbors = get_neighbors(j)
                    if len(new_neighbors) >= min_points - 1:
                        seed_set.extend(new_neighbors)
                if cluster_ids[j] == -1:
                    cluster_ids[j] = current_cluster

            current_cluster += 1

    # Build cluster summary objects
    cluster_map = {}
    for i, cid in enumerate(cluster_ids):
        if cid == -1:
            continue
        if cid not in cluster_map:
            cluster_map[cid] = []
        cluster_map[cid].append(alerts[i])

    result = []
    priority_order = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}

    for cid, members in cluster_map.items():
        lats = [a["lat"] for a in members]
        lngs = [a["lng"] for a in members]
        center_lat = sum(lats) / len(lats)
        center_lng = sum(lngs) / len(lngs)

        # Cluster risk = highest priority among members
        max_priority = max(members, key=lambda a: priority_order.get(a.get("priority", "LOW"), 0))
        risk_level = max_priority.get("priority", "LOW")

        # Count disaster types
        type_counts = {}
        for m in members:
            t = m.get("disaster_type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1

        result.append({
            "cluster_id": cid,
            "center_lat": round(center_lat, 6),
            "center_lng": round(center_lng, 6),
            "count": len(members),
            "risk_level": risk_level,
            "dominant_type": max(type_counts, key=type_counts.get),
            "type_breakdown": type_counts,
            "alert_ids": [m["id"] for m in members],
        })

    # Sort by count descending (largest clusters first)
    result.sort(key=lambda c: c["count"], reverse=True)
    return result