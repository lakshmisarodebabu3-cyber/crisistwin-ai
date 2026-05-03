# 🚨 CrisisTwin AI — Real-Time Disaster Management System

A hackathon-grade intelligent crisis response platform with AI prioritization,
live maps, heatmaps, clustering, disaster simulation, and route optimization.

---

## 📁 Folder Structure

```
crisistwin-ai/
├── backend/
│   ├── app.py                  ← Flask API (main entry point)
│   ├── priority_engine.py      ← AI priority classification
│   ├── cluster_engine.py       ← Spatial clustering (DBSCAN-style)
│   ├── simulation_engine.py    ← Disaster spread simulation
│   ├── requirements.txt        ← Python dependencies
│   └── data/
│       └── sos_alerts.json     ← Persistent alert storage
├── frontend/
│   ├── index.html              ← Main app page
│   ├── css/
│   │   └── style.css           ← Dark command-center UI
│   └── js/
│       └── app.js              ← All frontend logic
└── run.sh                      ← One-click start script
```

---

## 🚀 Step-by-Step Setup (Mac + VS Code)

### Step 1 — Prerequisites
Make sure Python 3 is installed. Check with:
```bash
python3 --version
```
If not installed: https://www.python.org/downloads/

### Step 2 — Open Project in VS Code
1. Open VS Code
2. Go to File → Open Folder → select the `crisistwin-ai` folder

### Step 3 — Open Terminal in VS Code
Press: `Ctrl + `` ` (backtick) or go to Terminal → New Terminal

### Step 4 — Install Dependencies
```bash
cd backend
pip3 install flask flask-cors
```

### Step 5 — Run the Backend
```bash
python3 app.py
```
You should see:
```
🚨 CrisisTwin AI Backend starting on http://localhost:5000
```

### Step 6 — Open the App
Open your browser and go to:
```
http://localhost:5000
```

### Step 7 — Load Demo Data
Click the **⚡ Load Demo** button in the top-right to seed 10 realistic SOS alerts.

---

## 🎮 How to Use

| Feature | How to Use |
|---|---|
| **Send SOS** | Click map to set location → pick type → slide severity → DISPATCH |
| **View Alerts** | Left sidebar list, click any alert for details |
| **Heatmap** | Click 🌡 Heatmap in map toolbar |
| **Clustering** | Click 🔵 Clusters — detects critical zones |
| **Simulation** | Open alert → click 🌀 Simulate → drag slider or Auto Play |
| **Route** | Open alert → click 🗺 Get Route |
| **Filter** | Use High/Med/Low pills in the alert list |
| **Clear** | Click ✕ Clear All in top nav |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/sos` | Submit new SOS alert |
| GET | `/api/alerts` | Get all alerts |
| GET | `/api/dashboard` | Dashboard statistics |
| GET | `/api/clusters` | Cluster analysis |
| GET | `/api/simulation` | Disaster spread simulation |
| GET | `/api/route` | Route planning |
| POST | `/api/seed` | Load demo data |
| POST | `/api/clear` | Clear all alerts |
| POST | `/api/alerts/<id>/resolve` | Resolve an alert |

---

## 🧠 AI Features

- **Priority Engine**: Weighted rule-based classifier using disaster type, severity score, and NLP keyword analysis on descriptions. Outputs HIGH / MEDIUM / LOW.
- **Cluster Engine**: Simplified DBSCAN spatial clustering to identify hotspot zones.
- **Simulation Engine**: Non-linear spread model with organic polygon generation for realistic disaster spread visualization (Digital Twin).

---

## 🛑 Stopping the App
In the terminal, press `Ctrl + C`

## 🌐 Live Demo

🚀 Click here to use the app:  
https://crisistwin.netlify.app/
