/**
 * CrisisTwin AI — Frontend Application
 * Complete map, SOS, dashboard, simulation, clustering, and routing logic
 */

"use strict";

// ─── Constants ────────────────────────────────────────────────────────────────
const API = "http://localhost:5000/api";

// Rescue base coordinates (Bengaluru city center as default)
const RESCUE_BASE = { lat: 12.9716, lng: 77.5946 };

const DISASTER_ICONS = {
  flood:    "🌊",
  fire:     "🔥",
  medical:  "🚑",
  collapse: "🏚",
  chemical: "☣️",
  unknown:  "❓",
  tsunami:  "🌊",
  explosion:"💥",
};

const PRIORITY_COLORS = {
  HIGH:   "#ff3b3b",
  MEDIUM: "#ff9500",
  LOW:    "#34c759",
};

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  alerts:        [],         // all fetched alerts
  filtered:      [],         // alerts shown in sidebar list
  mapMode:       "markers",  // markers | heatmap | clusters
  selectedAlert: null,       // currently open modal alert
  simActive:     false,
  simAlert:      null,       // alert used as sim epicenter
  simAutoTimer:  null,
  routeLayerGroup: null,
  rescueBaseMarker: null,
  filterLevel:   "all",
};

// ─── Leaflet Map ──────────────────────────────────────────────────────────────
let map, heatLayer, clusterGroup, markersGroup, simLayer, routeLayer;

function initMap() {
  map = L.map("map", {
    center: [RESCUE_BASE.lat, RESCUE_BASE.lng],
    zoom: 13,
    zoomControl: true,
  });

  // Dark tile layer (OpenStreetMap)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "OpenStreetMap",
  }).addTo(map);

  // Initialize layer groups
  markersGroup = L.layerGroup().addTo(map);
  clusterGroup = L.markerClusterGroup({ showCoverageOnHover: false });
  routeLayer   = L.layerGroup().addTo(map);

  // Rescue base marker
  state.rescueBaseMarker = L.marker([RESCUE_BASE.lat, RESCUE_BASE.lng], {
    icon: L.divIcon({
      html: `<div style="
        width:32px;height:32px;border-radius:50%;
        background:rgba(0,212,255,0.15);
        border:2px solid #00d4ff;
        display:flex;align-items:center;justify-content:center;
        font-size:16px;box-shadow:0 0 20px rgba(0,212,255,0.3);
      ">🏥</div>`,
      className: "",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    }),
    zIndexOffset: 1000,
  }).addTo(map).bindTooltip("🏥 Rescue Base", { permanent: false, direction: "right" });

  // Click on map to place SOS
  map.on("click", function (e) {
    setLocationFromMap(e.latlng.lat, e.latlng.lng);
  });
}

// ─── Location Capture ──────────────────────────────────────────────────────
let capturedLat = null, capturedLng = null;

function captureLocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation not supported. Click map instead.", "warning");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => setLocationFromMap(pos.coords.latitude, pos.coords.longitude),
    () => {
      showToast("Location access denied. Click on the map to set location.", "warning");
    }
  );
}

function setLocationFromMap(lat, lng) {
  capturedLat = lat;
  capturedLng = lng;
  document.getElementById("loc-text").textContent =
    `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  showToast(`📍 Location set: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, "info");
}

// ─── SOS Submission ────────────────────────────────────────────────────────
let selectedDisasterType = "flood";

function selectType(btn) {
  document.querySelectorAll(".dtype-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  selectedDisasterType = btn.dataset.type;
}

async function submitSOS() {
  if (!capturedLat || !capturedLng) {
    showToast("📍 Set location first — get GPS or click on the map!", "error");
    return;
  }

  const payload = {
    lat: capturedLat,
    lng: capturedLng,
    disaster_type: selectedDisasterType,
    severity_hint: parseInt(document.getElementById("severity").value),
    description: document.getElementById("description").value.trim(),
  };

  try {
    const res = await fetch(`${API}/sos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.success) {
      const priority = data.alert.priority;
      showToast(
        `🚨 SOS Dispatched! Priority: ${priority} | ID: ${data.alert.id}`,
        priority === "HIGH" ? "error" : priority === "MEDIUM" ? "warning" : "success"
      );
      document.getElementById("description").value = "";
      await refreshAll();
    } else {
      showToast("Failed to send SOS: " + (data.error || "Unknown error"), "error");
    }
  } catch (err) {
    showToast("Backend not reachable. Is Flask running?", "error");
  }
}

// ─── API Calls ────────────────────────────────────────────────────────────
async function fetchAlerts() {
  const res = await fetch(`${API}/alerts`);
  return await res.json();
}

async function fetchDashboard() {
  const res = await fetch(`${API}/dashboard`);
  return await res.json();
}

async function fetchClusters() {
  const res = await fetch(`${API}/clusters`);
  return await res.json();
}

async function seedDemoData() {
  try {
    await fetch(`${API}/seed`, { method: "POST" });
    showToast("⚡ Demo data loaded! 10 SOS alerts seeded.", "success");
    await refreshAll();
  } catch (e) {
    showToast("Backend not reachable.", "error");
  }
}

async function clearAllAlerts() {
  if (!confirm("Clear ALL alerts? This cannot be undone.")) return;
  await fetch(`${API}/clear`, { method: "POST" });
  showToast("All alerts cleared.", "info");
  await refreshAll();
}

// ─── Refresh Loop ──────────────────────────────────────────────────────────
async function refreshAll() {
  try {
    const [alerts, stats] = await Promise.all([fetchAlerts(), fetchDashboard()]);
    state.alerts = alerts;
    updateDashboard(stats);
    updateAlertList();
    renderMapForMode();
  } catch (err) {
    console.warn("Refresh failed:", err);
  }
}

// ─── Dashboard Updates ─────────────────────────────────────────────────────
let typeChart = null;

function updateDashboard(stats) {
  animateNum("st-total",    stats.total);
  animateNum("st-active",   stats.active);
  animateNum("st-high",     stats.high);
  animateNum("st-medium",   stats.medium);
  animateNum("st-low",      stats.low);
  animateNum("st-resolved", stats.resolved);

  updateTypeChart(stats.by_type);
}

function animateNum(id, target) {
  const el = document.getElementById(id);
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  let start = current;
  const step = () => {
    start += Math.sign(target - start) * Math.max(1, Math.ceil(Math.abs(target - start) / 8));
    el.textContent = start;
    if (start !== target) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateTypeChart(byType) {
  const labels = Object.keys(byType);
  const data   = Object.values(byType);
  const colors = labels.map((_, i) => [
    "#ff5a1f","#00d4ff","#ff3b3b","#ff9500","#34c759","#bf5af2"
  ][i % 6]);

  if (!typeChart) {
    const ctx = document.getElementById("typeChart").getContext("2d");
    typeChart = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#7a8ba4", font: { family: "Space Mono", size: 10 }, padding: 8, boxWidth: 10 },
          },
        },
        cutout: "65%",
      },
    });
  } else {
    typeChart.data.labels = labels;
    typeChart.data.datasets[0].data   = data;
    typeChart.data.datasets[0].backgroundColor = colors;
    typeChart.update();
  }
}

// ─── Alert List ────────────────────────────────────────────────────────────
function updateAlertList() {
  const active = state.alerts.filter((a) => a.status === "active");
  const f = state.filterLevel;
  state.filtered = f === "all" ? active : active.filter((a) => a.priority === f);
  state.filtered.sort((a, b) => {
    const pw = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return (pw[b.priority] || 0) - (pw[a.priority] || 0);
  });

  const el = document.getElementById("alert-list");
  if (state.filtered.length === 0) {
    el.innerHTML = `<div class="empty-state">No ${f === "all" ? "" : f.toLowerCase() + " priority"} alerts found.</div>`;
    return;
  }

  el.innerHTML = state.filtered
    .map((a) => {
      const icon = DISASTER_ICONS[a.disaster_type] || "❓";
      const time = timeSince(a.timestamp);
      return `
      <div class="alert-item ${a.priority}" onclick="openAlertModal('${a.id}')">
        <span class="alert-icon">${icon}</span>
        <div class="alert-info">
          <div class="alert-id">${a.id}</div>
          <div class="alert-type">${a.disaster_type}</div>
          <div class="alert-desc">${a.description || "No description"}</div>
        </div>
        <div class="alert-meta">
          <span class="priority-badge badge-${a.priority}">${a.priority}</span>
          <span class="alert-time">${time}</span>
        </div>
      </div>`;
    })
    .join("");
}

function filterAlerts(level, btn) {
  state.filterLevel = level;
  document.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  updateAlertList();
}

function timeSince(isoStr) {
  const sec = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (sec < 60)  return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  return `${Math.floor(sec/3600)}h ago`;
}

// ─── Map Rendering ─────────────────────────────────────────────────────────
function setMapMode(mode, btn) {
  state.mapMode = mode;
  document.querySelectorAll(".map-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  // Hide overlay panels that belong to other modes
  document.getElementById("cluster-panel").style.display = "none";

  renderMapForMode();
}

function renderMapForMode() {
  clearMapLayers();
  const active = state.alerts.filter((a) => a.status === "active");

  if (state.mapMode === "markers") renderMarkers(active);
  else if (state.mapMode === "heatmap") renderHeatmap(active);
  else if (state.mapMode === "clusters") renderClusters(active);
}

function clearMapLayers() {
  markersGroup.clearLayers();
  map.removeLayer(clusterGroup);
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
}

// ── Markers mode ──────────────────────────────────────────────────────────
function renderMarkers(alerts) {
  alerts.forEach((a) => {
    const color = PRIORITY_COLORS[a.priority] || "#999";
    const icon  = DISASTER_ICONS[a.disaster_type] || "❓";

    const divIcon = L.divIcon({
      html: `<div style="
        width:36px;height:36px;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        background:${color}22;
        border:2px solid ${color};
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 15px ${color}55;
      "><span style="transform:rotate(45deg);font-size:16px">${icon}</span></div>`,
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -38],
    });

    const marker = L.marker([a.lat, a.lng], { icon: divIcon });
    marker.bindPopup(buildPopup(a), { maxWidth: 240 });
    markersGroup.addLayer(marker);
  });
}

function buildPopup(a) {
  const icon  = DISASTER_ICONS[a.disaster_type] || "❓";
  const color = PRIORITY_COLORS[a.priority] || "#999";
  return `
    <div class="popup-inner">
      <div class="popup-type" style="color:${color}">${icon} ${a.disaster_type}</div>
      <div class="popup-id">${a.id}</div>
      <div class="popup-desc">${a.description || "No description provided"}</div>
      <div class="popup-row">
        <span style="color:${color};font-weight:700">${a.priority}</span>
        <span>•</span>
        <span>${timeSince(a.timestamp)}</span>
      </div>
      <button class="popup-btn" onclick="openAlertModal('${a.id}')">View Details</button>
    </div>`;
}

// ── Heatmap mode ──────────────────────────────────────────────────────────
function renderHeatmap(alerts) {
  const priorityWeight = { HIGH: 1.0, MEDIUM: 0.6, LOW: 0.3 };
  const points = alerts.map((a) => [
    a.lat, a.lng,
    priorityWeight[a.priority] || 0.5,
  ]);

  heatLayer = L.heatLayer(points, {
    radius:  35,
    blur:    20,
    maxZoom: 17,
    gradient: {
      0.0: "#003366",
      0.3: "#0055cc",
      0.6: "#ff9500",
      0.85:"#ff3b3b",
      1.0: "#ffffff",
    },
  }).addTo(map);
}

// ── Cluster mode ──────────────────────────────────────────────────────────
async function renderClusters(alerts) {
  // Also show regular markers underneath
  renderMarkers(alerts);

  // Fetch AI clusters from backend
  const clusters = await fetchClusters();

  clusters.forEach((c) => {
    const color = PRIORITY_COLORS[c.risk_level] || "#999";
    const circle = L.circle([c.center_lat, c.center_lng], {
      radius: 600,
      color:  color,
      fillColor: color,
      fillOpacity: 0.08,
      weight: 2,
      dashArray: "6 4",
    }).addTo(markersGroup);

    const label = L.divIcon({
      html: `<div style="
        background:${color}22;border:1px solid ${color};
        border-radius:6px;padding:4px 8px;
        font-family:'Space Mono',monospace;font-size:11px;
        color:${color};white-space:nowrap;
        backdrop-filter:blur(8px);
      ">⚠ ${c.count} alerts · ${c.risk_level}</div>`,
      className: "",
      iconSize: [null, null],
    });
    L.marker([c.center_lat, c.center_lng], { icon: label }).addTo(markersGroup);
  });

  // Show cluster info panel
  const panel = document.getElementById("cluster-panel");
  const list  = document.getElementById("cluster-list");
  if (clusters.length === 0) {
    list.innerHTML = `<div style="font-size:11px;color:#7a8ba4;text-align:center;padding:8px">No clusters detected</div>`;
  } else {
    list.innerHTML = clusters.map((c) => `
      <div class="cluster-item">
        <div class="cluster-risk risk-${c.risk_level}">Zone ${c.cluster_id + 1} — ${c.risk_level} RISK</div>
        <div>${c.count} alerts · ${c.dominant_type}</div>
        <div style="font-size:10px;color:#3d4f66">${c.center_lat.toFixed(4)}, ${c.center_lng.toFixed(4)}</div>
      </div>`).join("");
  }
  panel.style.display = "block";
}

// ─── Alert Modal ──────────────────────────────────────────────────────────
function openAlertModal(alertId) {
  const a = state.alerts.find((x) => x.id === alertId);
  if (!a) return;
  state.selectedAlert = a;

  const color = PRIORITY_COLORS[a.priority] || "#999";
  const icon  = DISASTER_ICONS[a.disaster_type] || "❓";

  document.getElementById("modal-title").innerHTML =
    `<span style="color:${color}">${icon} ${a.disaster_type.toUpperCase()}</span>`;

  document.getElementById("modal-body").innerHTML = `
    <div class="modal-row"><span class="label">Alert ID</span><span class="value" style="font-family:var(--font-mono);font-size:11px">${a.id}</span></div>
    <div class="modal-row"><span class="label">Priority</span><span class="value" style="color:${color}">${a.priority}</span></div>
    <div class="modal-row"><span class="label">Type</span><span class="value">${icon} ${a.disaster_type}</span></div>
    <div class="modal-row"><span class="label">Severity</span><span class="value">${a.severity_hint}/10</span></div>
    <div class="modal-row"><span class="label">Coordinates</span><span class="value" style="font-family:var(--font-mono);font-size:11px">${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}</span></div>
    <div class="modal-row"><span class="label">Time</span><span class="value">${new Date(a.timestamp).toLocaleString()}</span></div>
    <div class="modal-row"><span class="label">Status</span><span class="value">${a.status}</span></div>
    ${a.description ? `<div class="modal-row" style="flex-direction:column;align-items:flex-start;gap:4px"><span class="label">Description</span><span style="color:var(--text-secondary);font-size:12px">${a.description}</span></div>` : ""}
  `;

  document.getElementById("modal-backdrop").style.display = "flex";
}

function closeModal() {
  document.getElementById("modal-backdrop").style.display = "none";
  state.selectedAlert = null;
}

async function resolveCurrentAlert() {
  if (!state.selectedAlert) return;
  await fetch(`${API}/alerts/${state.selectedAlert.id}/resolve`, { method: "POST" });
  showToast(`✓ Alert ${state.selectedAlert.id} resolved.`, "success");
  closeModal();
  await refreshAll();
}

// ─── Route Optimization ───────────────────────────────────────────────────
let routePolyline = null;

async function routeToAlert() {
  if (!state.selectedAlert) return;
  const a = state.selectedAlert;
  closeModal();

  
  try {
    const res = await fetch(
      `${API}/route?from_lat=${RESCUE_BASE.lat}&from_lng=${RESCUE_BASE.lng}&to_lat=${a.lat}&to_lng=${a.lng}`
    );
    const data = await res.json();

    clearRoute();

    const latlngs = data.waypoints.map((w) => [w.lat, w.lng]);

    // Draw animated route line
    routePolyline = L.polyline(latlngs, {
      color: "#34c759",
      weight: 4,
      opacity: 0.9,
      dashArray: "10 6",
    }).addTo(routeLayer);

    // Animate dash offset
    animateRoute(routePolyline);

    map.fitBounds(routePolyline.getBounds(), { padding: [60, 60] });

    document.getElementById("route-dist").textContent = `${data.distance_km} km`;
    document.getElementById("route-eta").textContent  = `~${data.eta_minutes} min`;
    document.getElementById("route-panel").style.display = "block";

    showToast(`🗺 Route plotted: ${data.distance_km} km, ~${data.eta_minutes} min ETA`, "success");
  } catch (err) {
    showToast("Route calculation failed.", "error");
  }
}

function animateRoute(polyline) {
  let offset = 0;
  const el = polyline.getElement ? polyline.getElement() : null;
  if (!el) return;
  const animate = () => {
    offset = (offset + 1) % 32;
    el.style.strokeDashoffset = -offset;
    if (routePolyline) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function clearRoute() {
  routeLayer.clearLayers();
  routePolyline = null;
  document.getElementById("route-panel").style.display = "none";
}

// ─── Simulation (Digital Twin) ─────────────────────────────────────────────
let simPolygon = null, simCore = null, simEvac = null;

function toggleSimulation() {
  const simPanel = document.getElementById("sim-controls");
  state.simActive = !state.simActive;
  simPanel.style.display = state.simActive ? "block" : "none";

  const btn = document.getElementById("btn-sim");
  if (state.simActive) {
    btn.classList.add("active");
    showToast("🌀 Simulation mode ON. Select a HIGH priority alert to simulate.", "info");
  } else {
    btn.classList.remove("active");
    stopSimulation();
  }
}

function stopSimulation() {
  state.simActive = false;
  state.simAlert  = null;
  clearSimLayers();
  document.getElementById("sim-controls").style.display = "none";
  document.getElementById("btn-sim").classList.remove("active");
  if (state.simAutoTimer) { clearInterval(state.simAutoTimer); state.simAutoTimer = null; }
}

function simFromAlert() {
  if (!state.selectedAlert) return;
  state.simAlert = state.selectedAlert;
  closeModal();

  // Activate sim panel
  state.simActive = true;
  document.getElementById("sim-controls").style.display = "block";
  document.getElementById("btn-sim").classList.add("active");
  document.getElementById("sim-coords").textContent =
    `${state.simAlert.lat.toFixed(4)}, ${state.simAlert.lng.toFixed(4)}`;
  document.getElementById("sim-step").value = 0;
  onSimStep(0);
}

async function onSimStep(step) {
  if (!state.simAlert) {
    showToast("Select an alert first to simulate.", "warning");
    return;
  }

  const a = state.simAlert;
  document.getElementById("sim-step-label").textContent = `${step} / 20`;

  try {
    const res = await fetch(
      `${API}/simulation?lat=${a.lat}&lng=${a.lng}&radius=0.4&step=${step}`
    );
    const sim = await res.json();

    clearSimLayers();

    // Draw evacuation zone (outer ring)
    const evacCoords = buildCircleCoords(a.lat, a.lng, sim.evacuation_radius_km);
    simEvac = L.polygon(evacCoords, {
      color: "#ff9500",
      fillColor: "#ff9500",
      fillOpacity: 0.03,
      weight: 1,
      dashArray: "8 5",
    }).addTo(markersGroup);

    // Draw spread polygon
    const spreadCoords = sim.spread_polygon.map((p) => [p.lat, p.lng]);
    simPolygon = L.polygon(spreadCoords, {
      color: "#ff3b3b",
      fillColor: "#ff3b3b",
      fillOpacity: 0.12 * sim.intensity,
      weight: 2,
    }).addTo(markersGroup);

    // Draw core danger zone
    const coreCoords = sim.core_polygon.map((p) => [p.lat, p.lng]);
    simCore = L.polygon(coreCoords, {
      color: "#ff3b3b",
      fillColor: "#ff3b3b",
      fillOpacity: 0.30 * sim.intensity,
      weight: 2,
    }).addTo(markersGroup);

    // Update UI
    document.getElementById("sim-status").textContent   = sim.status_label;
    document.getElementById("sim-radius").textContent   = `${sim.radius_km} km`;
    document.getElementById("sim-affected").textContent = `~${sim.affected_estimate.toLocaleString()}`;

    // Color sim status based on containment
    const statusEl = document.getElementById("sim-status");
    statusEl.style.color = sim.is_contained ? "#34c759" : "#ff3b3b";

  } catch (err) {
    showToast("Simulation request failed.", "error");
  }
}

function clearSimLayers() {
  if (simPolygon) { markersGroup.removeLayer(simPolygon); simPolygon = null; }
  if (simCore)    { markersGroup.removeLayer(simCore);    simCore    = null; }
  if (simEvac)    { markersGroup.removeLayer(simEvac);    simEvac    = null; }
}

function buildCircleCoords(lat, lng, radiusKm, numPoints = 32) {
  const points = [];
  const latR   = radiusKm / 111;
  const lngR   = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    points.push([lat + Math.sin(angle) * latR, lng + Math.cos(angle) * lngR]);
  }
  return points;
}

function autoPlaySim() {
  if (!state.simAlert) { showToast("Select an alert first.", "warning"); return; }
  if (state.simAutoTimer) { clearInterval(state.simAutoTimer); state.simAutoTimer = null; return; }

  let step = 0;
  document.getElementById("sim-step").value = 0;
  state.simAutoTimer = setInterval(() => {
    step++;
    document.getElementById("sim-step").value = step;
    onSimStep(step);
    if (step >= 20) { clearInterval(state.simAutoTimer); state.simAutoTimer = null; }
  }, 700);
}

// ─── Toast Notifications ──────────────────────────────────────────────────
function showToast(msg, type = "info") {
  const icons = { success: "✅", error: "🚨", warning: "⚠️", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span>`;
  document.getElementById("toast-container").appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── Clock ────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toUTCString().slice(17, 25) + " UTC";
}

// ─── Auto-Refresh ─────────────────────────────────────────────────────────
function startAutoRefresh() {
  setInterval(refreshAll, 8000); // refresh every 8 seconds
}

// ─── Init ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  refreshAll();
  startAutoRefresh();
  updateClock();
  setInterval(updateClock, 1000);
  showToast("CrisisTwin AI initialized. Click 'Load Demo' to see it in action!", "info");
});