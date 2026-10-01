# Buildathon 2.0 — Problem Statement 01
## Product Quality Inspection & Defect Tracking System

### 1. Problem in Simple Words

Manufacturers often keep product images, inspection results, and corrective actions in separate places. This makes it difficult to:

- connect a defect to its batch,
- understand why an inspection decision was made,
- track what repair was performed,
- check whether the same defect returned after repair.

The goal is to build **one system that connects inspection evidence, AI/ML suggestions, human review, corrective actions, and reinspection**.

> **Core idea:** AI helps inspect products, but humans review and make the important decisions.

---

## 2. Choose One Use Case

Choose **one product family and one organisation**.

Possible examples from the problem statement:

- Metal parts
- Fabric
- Tiles
- Bottles
- Packaging
- A comparable visual-inspection use case

A production-scale system is **not required**.

---

## 3. Main Workflow

```text
Register Product
      ↓
Create Batch
      ↓
Upload Inspection Image + Observation
      ↓
AI/ML Generates Suggestion
      ↓
Human Reviews AI Result
      ↓
 ┌──────────────┬──────────────────┐
 │              │                  │
No Defect    Defect Confirmed   Uncertain/Failed
 │              │                  │
 ↓              ↓                  ↓
Record       Corrective Action   More Evidence /
Outcome          ↓              Manual Review
              Reinspection
                  ↓
             Close / Reopen
```

A separate authorised user makes the **batch hold/release decision**.

One inspected image does **not** establish the quality of the entire batch.

---

## 4. Users / Roles

At least **two permission levels** must be enforced by the backend.

### Inspector / Operator
- Create inspections
- Upload images
- Add observations
- Confirm or challenge AI suggestions

### Production Supervisor
- Handle assigned defects
- Record corrective work
- Submit follow-up evidence

### Quality Manager
- Resolve disputed cases
- Record batch decisions
- Review trends/settings

---

## 5. Mandatory Application Features

### A. Products & Batches
Support:
- Create
- View
- Edit
- Archive

Store:
- Identifier
- Category
- Date
- Quantity where relevant
- Status

---

### B. Inspections & Images

An inspection must be linked to a product/batch.

Store:
- Inspector
- Time
- Item/sample reference
- Observations
- Original image/evidence

The system must support at least one image format.

Identify whether each image represents:
- an item,
- a surface,
- or a batch sample.

---

### C. ML Results & Human Review

Show the ML suggestion beside the image.

A reviewer must be able to:
- Confirm the suggestion
- Correct the suggestion
- Explain the decision
- Request more evidence

**Important:**

```text
AI Result ≠ Human-confirmed Result
```

Keep both separately.

---

### D. Defects & Corrective Actions

Store:
- Defect category
- Description
- Severity
- Evidence
- Review status

Corrective actions must have:
- Owner
- Target date
- Notes
- Status

Link corrective actions to follow-up inspections.

Allow defects to be:
- Closed
- Reopened

Do not delete the earlier findings.

---

### E. Batch Decisions

Show:
- Number of inspected items
- Number of reviewed items

An authorised user records:
- Batch Hold
- Batch Release

This decision must remain separate from individual inspection results.

---

### F. Dashboard & Search

Allow filtering by:
- Product
- Batch
- Date
- Defect category
- Review state
- Action owner

Dashboard should show:
- Pending reviews
- Confirmed defects
- Open corrective actions
- Recent activity
- At least one useful trend

Summary numbers should link back to their source records.

---

### G. APIs & Data Integrity

Provide APIs for:
- Records
- Uploads
- Processing
- Reviews
- Dashboard

Backend must validate:
- Permissions
- Identifiers
- Required values
- Status transitions

Prevent accidental repeated submissions where practical.

Return clear errors.

---

### H. History & Recovery

Record:
- Actor
- Time
- Reason

For important changes.

The system should:
- Preserve/version submitted evidence
- Preserve decisions
- Retain failed processing attempts
- Support retry/manual review
- Keep history working even when products become inactive

---

## 6. Database Relationship

The expected relationship is approximately:

```text
Product
   ↓
Batch
   ↓
Inspection
   ↓
Image
   ↓
ML Result
   ↓
Human Review
   ↓
Confirmed Defect
   ↓
Corrective Action
   ↓
Follow-up Inspection
```

Users and history should connect important changes to their author.

Store file references/metadata in the database. File bytes can use local or cloud storage.

---

## 7. AI/ML Requirement

The system must integrate **one learned capability that processes inspection images**.

Allowed approaches include:

### Good / Defective Classification
```text
Image → Good / Defective
```

Binary classification alone is sufficient as the core ML task.

### Defect Category Classification
Suggest a visible defect type **only when the dataset provides those labels**.

### Visual Anomaly Detection
Compare the image with normal examples and flag unusual appearance.

### Learned Image Similarity
Find similar previously reviewed defects.

---

### ML Result Storage

Store:
- Input reference
- Predicted class or retrieved matches
- Model/version
- Processing time
- Score when available

Do **not** invent confidence values.

Similarity/anomaly scores are not automatically probabilities.

---

## 8. ML Evaluation

Use a **held-out evaluation set**.

Disclose:
- Class counts
- Data split
- Preprocessing
- Model/version

Report:
- Confusion matrix or suitable metric
- Successes
- Failures

Keep near-duplicates/augmentations of the same item together.

There is **no fixed accuracy target**.

---

## 9. ML Limitations

Important limitations:

- Binary labels do not establish crack/scratch/dent classes.
- Images alone do not establish machine faults.
- Images alone do not establish supplier responsibility.
- Manual review must remain available for unsupported products, poor images, and model failure.
- Rules alone do **not** satisfy the ML requirement.

---

## 10. Generative AI Requirement

Implement one GenAI feature grounded in:

- Stored inspections
- Confirmed defects
- Corrective actions

A generic chatbot is **not sufficient**.

Possible features:

### Batch Summary
> "Summarise Batch B-104."

Should provide:
- Inspection coverage
- Pending reviews
- Confirmed defects
- Open actions

### Historical Issue Search
> "Have we seen this issue before?"

Should show related inspections and corrective actions without assuming the same cause.

### Attention Summary
> "What needs attention today?"

Could identify:
- Overdue actions
- Unreviewed inspections
- Reopened cases

### Quality Report
Generate a report for a selected period that separates:
- Observations
- Suggestions

---

## 11. GenAI Rules

GenAI must:

- Retrieve only permitted records.
- Cite inspection/action IDs or links.
- Distinguish unreviewed AI predictions from confirmed outcomes.
- Compute counts/rates using code or database queries.
- State when evidence is missing.

GenAI must **not**:
- Automatically release batches
- Automatically close issues
- Certify quality

Test the GenAI with:
1. A supported question
2. An unknown batch
3. A misleading premise
4. An unauthorised-data request

Uploaded notes/documents are evidence, not instructions that can override permissions.

---

## 12. Possible Workflows

### Incoming Batch

```text
Register
→ Upload samples
→ ML flags
→ Reviewer confirms/corrects
→ Corrective action/follow-up
→ Human batch decision
```

### Recurring Defect

```text
Find related confirmed issues
→ Compare action history
→ Investigate recurrence
→ New corrective action
→ Follow-up
```

### Unreliable Inspection

```text
Blurred/unsupported image
→ Needs review
→ New image or manual inspection
→ Retain history
```

---

## 13. Optional / Advanced Features

Possible additions:

- Defect-region annotations
- Image-quality checks
- Similarity search
- Bulk uploads
- Inspection checklists
- Before/after comparisons
- Notifications
- Offline-friendly upload queue

Improving an existing feature is also valid.

---

## 14. Innovation Requirement

Implement **one team-designed improvement**.

Possible areas:
- Review priority
- Inspector disagreement
- Corrective-action effectiveness
- Recurring issues
- Unfamiliar products
- Interface improvements
- Workflow improvements
- Algorithm improvements

Extra AI is **not compulsory**.

Explain:
1. User problem
2. Your approach
3. How you tested its value

---

## 15. Out of Scope

Not required:

- Live cameras
- Sensors
- Machinery control
- Manufacturing ERP integration
- Large-model training
- Support for every product
- Production-scale deployment

Segmentation and machine-failure prediction are optional.

**Manual uploads and reliable local demonstration are sufficient.**

This is a **visual-inspection decision-support system**, not:
- Safety certification
- Proof that invisible defects are absent

Final batch decisions remain human.

---

## 16. Frontend Screens

A practical application can contain:

1. Login
2. Dashboard
3. Products
4. Batches
5. Inspection creation
6. Image upload
7. AI result + human review
8. Defect details
9. Corrective action
10. Reinspection
11. Batch decision
12. History / audit trail
13. GenAI quality assistant/report

Screens may be combined.

Show:
- Loading states
- Empty states
- Failed uploads
- AI unavailable states

Do not lose submitted records when something fails.

---

## 17. Important Data Rule

**Count items, not photographs.**

If one product has three photographs:

```text
1 item
3 photographs
```

Do not treat those as three independent products.

Every defect rate must clearly define its denominator.

---

## 18. Final Demonstration

The final demo should show:

```text
Create Product/Batch
        ↓
Upload an unseen evaluation image
        ↓
Store ML result
        ↓
Human confirms/corrects
        ↓
Assign corrective action
        ↓
Complete action
        ↓
Reinspect
        ↓
Show history/dashboard
        ↓
Generate cited GenAI summary
```

Also demonstrate:

- Uncertainty/failure
- Refused unauthorised action
- Measured innovation value

A prerecorded success-only demo is insufficient.

---

## 19. Simplified Project Goal

> **Build a system where a factory can upload product inspection evidence, use AI to flag possible defects, let a human verify the result, assign and track corrective actions, reinspect repaired products, make human-controlled batch decisions, and use grounded GenAI to understand the inspection history.**

---

## 20. Suggested Implementation Order

```text
Phase 1
Database + Authentication + Roles

Phase 2
Products + Batches

Phase 3
Inspection + Image Upload

Phase 4
ML Model + Processing API

Phase 5
Human Review

Phase 6
Defects + Corrective Actions

Phase 7
Reinspection + Batch Decisions

Phase 8
Dashboard + Search + History

Phase 9
Grounded GenAI

Phase 10
Innovation + Failure Cases

Phase 11
ML Evaluation + Testing

Phase 12
Final Demo + Documentation
```

### Core Architecture

```text
Frontend
   ↓
Backend API
   ├── Authentication / Permissions
   ├── Products & Batches
   ├── Inspections
   ├── Image Processing
   ├── ML Service
   ├── Human Review
   ├── Defects & Actions
   ├── Reinspection
   ├── Dashboard
   ├── History
   └── GenAI / Retrieval
          ↓
      Database
          +
    Image Storage
```

**Source:** Buildathon 2.0 — Third-Year Track, Problem Statement 01.
