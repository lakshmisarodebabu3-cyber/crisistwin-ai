"""
CrisisTwin AI - Backend Flask Application
Main entry point for the crisis management system API
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import json
import os
import time
import math
import random
from datetime import datetime
from priority_engine import classify_priority
from cluster_engine import detect_clusters
from simulation_engine import get_simulation_step

# ─── App Setup ────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "sos_alerts.json")

# ─── Helpers ──────────────────────────────────────────────────────────────────

def load_alerts():
    """Load all SOS alerts from JSON storage."""
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r") as f:
        return json.load(f)

def save_alerts(alerts):
    """Persist alerts to JSON file."""
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w") as f:
        json.dump(alerts, f, indent=2)

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two GPS coordinates."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the frontend."""
    return send_from_directory("../frontend", "index.html")

@app.route("/api/sos", methods=["POST"])
def submit_sos():
    """
    Accept a new SOS alert from a user.
    Body: { lat, lng, disaster_type, severity_hint, description }
    """
    data = request.get_json()

    if not data or "lat" not in data or "lng" not in data:
        return jsonify({"error": "lat and lng are required"}), 400

    alerts = load_alerts()

    # Build alert object
    alert_id = f"SOS-{int(time.time() * 1000)}"
    alert = {
        "id": alert_id,
        "lat": float(data["lat"]),
        "lng": float(data["lng"]),
        "disaster_type": data.get("disaster_type", "unknown"),
        "severity_hint": data.get("severity_hint", 5),
        "description": data.get("description", ""),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "status": "active",
    }

    # AI Priority Classification
    alert["priority"] = classify_priority(alert)

    alerts.append(alert)
    save_alerts(alerts)

    return jsonify({"success": True, "alert": alert}), 201


@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    """Return all SOS alerts with optional filters."""
    alerts = load_alerts()
    priority_filter = request.args.get("priority")
    if priority_filter:
        alerts = [a for a in alerts if a.get("priority") == priority_filter]
    return jsonify(alerts)


@app.route("/api/alerts/<alert_id>/resolve", methods=["POST"])
def resolve_alert(alert_id):
    """Mark an alert as resolved."""
    alerts = load_alerts()
    for a in alerts:
        if a["id"] == alert_id:
            a["status"] = "resolved"
            save_alerts(alerts)
            return jsonify({"success": True})
    return jsonify({"error": "Alert not found"}), 404


@app.route("/api/dashboard", methods=["GET"])
def dashboard_stats():
    """Return aggregated stats for the dashboard."""
    alerts = load_alerts()
    active = [a for a in alerts if a.get("status") == "active"]
    resolved = [a for a in alerts if a.get("status") == "resolved"]

    stats = {
        "total": len(alerts),
        "active": len(active),
        "resolved": len(resolved),
        "high": len([a for a in active if a.get("priority") == "HIGH"]),
        "medium": len([a for a in active if a.get("priority") == "MEDIUM"]),
        "low": len([a for a in active if a.get("priority") == "LOW"]),
        "by_type": {},
        "recent": sorted(active, key=lambda x: x["timestamp"], reverse=True)[:5],
    }

    for a in active:
        t = a.get("disaster_type", "unknown")
        stats["by_type"][t] = stats["by_type"].get(t, 0) + 1

    return jsonify(stats)


@app.route("/api/clusters", methods=["GET"])
def get_clusters():
    """Run clustering on active alerts to detect critical zones."""
    alerts = load_alerts()
    active = [a for a in alerts if a.get("status") == "active"]
    clusters = detect_clusters(active)
    return jsonify(clusters)


@app.route("/api/simulation", methods=["GET"])
def get_simulation():
    """
    Return current disaster spread simulation state.
    Query params: lat, lng, radius, step (0-20)
    """
    try:
        lat = float(request.args.get("lat", 12.9716))
        lng = float(request.args.get("lng", 77.5946))
        radius = float(request.args.get("radius", 0.5))
        step = int(request.args.get("step", 0))
    except ValueError:
        return jsonify({"error": "Invalid parameters"}), 400

    result = get_simulation_step(lat, lng, radius, step)
    return jsonify(result)


@app.route("/api/route", methods=["GET"])
def get_route():
    """
    Basic route suggestion: straight-line path from rescue_base to alert.
    Query: from_lat, from_lng, to_lat, to_lng
    """
    try:
        from_lat = float(request.args.get("from_lat", 12.9716))
        from_lng = float(request.args.get("from_lng", 77.5946))
        to_lat = float(request.args.get("to_lat"))
        to_lng = float(request.args.get("to_lng"))
    except (TypeError, ValueError):
        return jsonify({"error": "All four coordinate params required"}), 400

    distance = haversine_distance(from_lat, from_lng, to_lat, to_lng)

    # Generate waypoints along the route (simple interpolation)
    steps = 6
    waypoints = []
    for i in range(steps + 1):
        t = i / steps
        # Add slight randomness to simulate real road routing
        jitter_lat = random.uniform(-0.002, 0.002) if 0 < i < steps else 0
        jitter_lng = random.uniform(-0.002, 0.002) if 0 < i < steps else 0
        waypoints.append({
            "lat": from_lat + (to_lat - from_lat) * t + jitter_lat,
            "lng": from_lng + (to_lng - from_lng) * t + jitter_lng,
        })

    eta_minutes = round((distance / 40) * 60)  # assume 40 km/h avg speed

    return jsonify({
        "from": {"lat": from_lat, "lng": from_lng},
        "to": {"lat": to_lat, "lng": to_lng},
        "distance_km": round(distance, 2),
        "eta_minutes": eta_minutes,
        "waypoints": waypoints,
    })


@app.route("/api/seed", methods=["POST"])
def seed_demo_data():
    """Seed demo SOS alerts for hackathon demonstration."""
    demo_alerts = [
        {"lat": 12.9716, "lng": 77.5946, "disaster_type": "flood",    "severity_hint": 9,  "description": "Water level rising rapidly"},
        {"lat": 12.9780, "lng": 77.6000, "disaster_type": "flood",    "severity_hint": 8,  "description": "People trapped on rooftop"},
        {"lat": 12.9650, "lng": 77.5900, "disaster_type": "fire",     "severity_hint": 10, "description": "Building on fire, 20+ trapped"},
        {"lat": 12.9820, "lng": 77.5870, "disaster_type": "medical",  "severity_hint": 7,  "description": "Mass casualty event"},
        {"lat": 12.9600, "lng": 77.6100, "disaster_type": "collapse", "severity_hint": 9,  "description": "Bridge structural failure"},
        {"lat": 12.9740, "lng": 77.6050, "disaster_type": "flood",    "severity_hint": 5,  "description": "Road flooded, need evacuation"},
        {"lat": 12.9900, "lng": 77.5950, "disaster_type": "medical",  "severity_hint": 3,  "description": "Elderly person needs assistance"},
        {"lat": 12.9550, "lng": 77.5800, "disaster_type": "fire",     "severity_hint": 6,  "description": "Wildfire approaching suburb"},
        {"lat": 12.9690, "lng": 77.6150, "disaster_type": "collapse", "severity_hint": 8,  "description": "Building collapse, 5 trapped"},
        {"lat": 12.9850, "lng": 77.6080, "disaster_type": "flood",    "severity_hint": 4,  "description": "Basement flooding"},
    ]

    alerts = []
    base_time = time.time()
    for i, d in enumerate(demo_alerts):
        d["id"] = f"SOS-DEMO-{i+1:03d}"
        d["timestamp"] = datetime.utcfromtimestamp(base_time - (i * 300)).isoformat() + "Z"
        d["status"] = "active"
        d["priority"] = classify_priority(d)
        alerts.append(d)

    save_alerts(alerts)
    return jsonify({"success": True, "seeded": len(alerts)})


@app.route("/api/clear", methods=["POST"])
def clear_alerts():
    """Clear all alerts (for demo resets)."""
    save_alerts([])
    return jsonify({"success": True})


if __name__ == "__main__":
    os.makedirs(os.path.join(os.path.dirname(__file__), "data"), exist_ok=True)
    print("🚨 CrisisTwin AI Backend starting on http://localhost:5000")
    app.run(debug=True, port=5000, host="0.0.0.0")