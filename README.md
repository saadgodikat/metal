# ApexVision — Product Quality Inspection & Defect Tracking System
### Buildathon 2.0 (Problem Statement 01)

ApexVision is an AI-assisted visual quality inspection decision-support and defect tracking system for precision machined metal components. It seamlessly unites optical inspection evidence, machine learning suggestions, independent human review gates, supervisor corrective actions, follow-up reinspection, and grounded GenAI quality intelligence.

---

## 🚀 Key Features & Architectural Compliance

1. **Physical Item Cardinality (§3 & §5B)**:
   - Tracks unique physical items (denominator) separately from multi-angle photo captures, eliminating photo-inflation.

2. **Strict Separation of Raw AI vs. Human Review (§5C)**:
   - Independent relational persistence for `ml_results` and `human_reviews`. AI suggestions never overwrite human sign-offs.

3. **Machine Vision & Image Quality Screening (§7 & §8)**:
   - Automated Laplacian blur variance heuristic to detect blurred or corrupted inspection photos.
   - Fine-calibrated multi-class defect classifier (`MetalDefectVision-ResNet v1.2.0`) distinguishing *Scratch, Porosity, Dent, Corrosion*, and *Nominal Pass*.
   - **Held-Out Evaluation Suite**: Generates a 5x5 confusion matrix and precision/recall/F1 metrics on unseen test samples.

4. **Role-Based Access Control (RBAC) & Batch Gate (§4 & §5E)**:
   - Strict permission middleware for `INSPECTOR`, `SUPERVISOR`, and `QUALITY_MANAGER`.
   - Batch release is exclusively authorized for Quality Managers; attempts by unauthorized inspectors or premature releases with active defects are strictly blocked.

5. **Closed-Loop Defect Lifecycle (§5D & §5E)**:
   - *Confirmed Defect Ticket $\rightarrow$ Supervisor Work Order $\rightarrow$ Physical Repair $\rightarrow$ Reinspection Verification $\rightarrow$ Defect Closed $\rightarrow$ Quality Manager Batch Disposition*.

6. **Grounded GenAI Copilot (§10 & §11)**:
   - Deterministic database tool calling (calculates counts from SQL queries, zero hallucination).
   - Generates citations (`[Batch #B-101]`, `[Defect #DEF-101]`, `[Action #ACT-1]`).
   - Built-in guardrails blocking autonomous batch release and detecting premise contradictions.

7. **Team Innovation: Confidence-Risk Discrepancy Matrix (CRDM) (§14)**:
   - Algorithmic **Audit Priority Index (APIx)** to prioritize inspections and counter operator automation bias.
   - Dual-Check warning gate when high-anomaly items are marked as pass.
   - Real-time inspector-AI agreement analytics.

8. **Stitch Cleanroom Light & Dark Themes (§16)**:
   - Dual-theme industrial interface styled after Google Stitch telemetry platforms.
   - Dual-reticle optical viewfinder, calibrated measurement grid, and real-time SVG sparklines.

---

## 🛠️ Technology Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, SQLite / PostgreSQL, Pillow, NumPy, PyTorch / Computer Vision Heuristics, JWT RBAC
- **Frontend**: React 19, Vite 8, Material Symbols Outlined, Inter & JetBrains Mono, Custom CSS Design Tokens
- **AI/ML**: `MetalDefectVision-ResNet (v1.2.0)`, Grounded Tool-Use GenAI Engine

---

## 📦 Quick Start & Installation

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment and activate
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend will be operational at: `http://localhost:8000`  
Interactive Swagger API documentation: `http://localhost:8000/docs`

---

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install npm packages
npm install

# Start Vite development server
npm run dev -- --host 0.0.0.0 --port 5173
```

Frontend interface will be live at: `http://localhost:5173`

---

## 🧪 Automated System Verification Suite

Run the end-to-end integration and negative test suite:

```bash
source backend/venv/bin/activate
python backend/tests/verify_system.py
```

### Verified Test Cases:
- `[TEST 1]` Inspector authentication & token validation
- `[TEST 2]` Quality Manager authentication
- `[TEST 3]` Unauthorized batch release attempt blocked with `403 Forbidden`
- `[TEST 4]` Premature batch release with active defects blocked with `400 Bad Request`
- `[TEST 5]` Laplacian blur variance heuristic screening
- `[TEST 6]` Grounded GenAI citations, autonomous action guardrail & contradiction catch
- `[TEST 7]` Team Innovation: CRDM APIx priority queue ranking
- `[TEST 8]` Held-out evaluation suite: 16 test samples with 5x5 confusion matrix

---

## 👥 Simulated Roles & Credentials

Use the simulated role switcher in the header or authenticate via API:

| Role | Username | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Inspector** | `inspector_mike` | `password123` | Upload images, run ML inference, record observations, human review |
| **Supervisor** | `supervisor_sarah` | `password123` | Assign defect work orders, record repairs, submit reinspections |
| **Quality Manager** | `manager_elena` | `password123` | Authorize batch hold/release decisions, full audit trail, resolve disputes |

---

## 📄 License

Developed for Buildathon 2.0 — Problem Statement 01.
