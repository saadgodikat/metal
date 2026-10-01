import os
import json
import uuid
import shutil
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.security import (
    verify_password, create_access_token, get_current_user, RequireRole
)
from backend.app.models.entities import (
    User, Product, Batch, InspectionItem, Inspection, InspectionImage,
    MLResult, HumanReview, Defect, CorrectiveAction, Reinspection,
    BatchDecision, AuditLog
)
from backend.app.schemas.schemas import (
    LoginRequest, TokenResponse, UserResponse,
    ProductCreate, ProductResponse,
    BatchCreate, BatchUpdate, BatchResponse,
    InspectionItemCreate, InspectionItemResponse,
    InspectionResponse, InspectionImageResponse,
    HumanReviewCreate, HumanReviewResponse,
    DefectResponse, CorrectiveActionCreate, CorrectiveActionUpdate, CorrectiveActionResponse,
    ReinspectionCreate, ReinspectionResponse,
    BatchDecisionCreate, BatchDecisionResponse,
    AuditLogResponse, GenAIQueryRequest, GenAIQueryResponse
)
from backend.app.services.ml_service import MetalDefectMLService
from backend.app.services.ml_evaluation import MLEvaluationSuite
from backend.app.services.genai_service import GroundedGenAIService
from backend.app.services.innovation_service import InnovationCRDMService

router = APIRouter()

def log_audit(db: Session, actor: User, entity_name: str, entity_id: str, action_type: str, reason: str = "", details: dict = None):
    audit = AuditLog(
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else "System",
        actor_role=actor.role if actor else "SYSTEM",
        entity_name=entity_name,
        entity_id=str(entity_id),
        action_type=action_type,
        reason=reason,
        details_json=json.dumps(details) if details else None
    )
    db.add(audit)
    db.commit()


# ==========================================
# 1. AUTHENTICATION & USERS
# ==========================================
@router.post("/auth/login", response_model=TokenResponse)
def login(form: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid username or password")
    
    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/auth/me", response_model=UserResponse)
def get_current_user_profile(user: User = Depends(get_current_user)):
    return user

@router.get("/auth/users", response_model=List[UserResponse])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(User).filter(User.is_active == True).all()


# ==========================================
# 2. PRODUCTS
# ==========================================
@router.get("/products", response_model=List[ProductResponse])
def get_products(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Product).all()

@router.post("/products", response_model=ProductResponse)
def create_product(
    data: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RequireRole(["QUALITY_MANAGER"]))
):
    existing = db.query(Product).filter(Product.product_code == data.product_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Product code already exists")
    
    prod = Product(
        product_code=data.product_code,
        name=data.name,
        category=data.category,
        description=data.description
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)
    log_audit(db, current_user, "Product", prod.product_code, "CREATE", f"Registered product {prod.name}")
    return prod


# ==========================================
# 3. BATCHES
# ==========================================
@router.get("/batches", response_model=List[BatchResponse])
def get_batches(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    batches = db.query(Batch).all()
    res = []
    for b in batches:
        inspected_count = db.query(Inspection).filter(Inspection.batch_id == b.id).count()
        defect_count = db.query(Defect).join(Inspection).filter(Inspection.batch_id == b.id).count()
        item = BatchResponse.model_validate(b)
        item.product_name = b.product.name
        item.product_code = b.product.product_code
        item.inspected_count = inspected_count
        item.defect_count = defect_count
        res.append(item)
    return res

@router.post("/batches", response_model=BatchResponse)
def create_batch(
    data: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RequireRole(["SUPERVISOR", "QUALITY_MANAGER"]))
):
    existing = db.query(Batch).filter(Batch.batch_number == data.batch_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Batch number already exists")

    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    batch = Batch(
        product_id=data.product_id,
        batch_number=data.batch_number,
        quantity=data.quantity,
        status="PENDING_INSPECTION",
        notes=data.notes
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    # Automatically create initial physical inspection items for the batch
    for i in range(1, min(data.quantity + 1, 6)):
        item = InspectionItem(
            batch_id=batch.id,
            item_code=f"ITM-{batch.batch_number}-{i:03d}",
            sample_type="ITEM",
            status="PENDING"
        )
        db.add(item)
    db.commit()

    log_audit(db, current_user, "Batch", batch.batch_number, "CREATE", f"Created batch with quantity {batch.quantity}")
    
    resp = BatchResponse.model_validate(batch)
    resp.product_name = product.name
    resp.product_code = product.product_code
    return resp

@router.get("/batches/{batch_id}/items", response_model=List[InspectionItemResponse])
def get_batch_items(batch_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(InspectionItem).filter(InspectionItem.batch_id == batch_id).all()


# ==========================================
# 4. INSPECTION INTAKE & IMAGE UPLOAD
# ==========================================
@router.get("/inspections", response_model=List[InspectionResponse])
def get_inspections(
    batch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Inspection).order_by(desc(Inspection.created_at))
    if batch_id:
        query = query.filter(Inspection.batch_id == batch_id)
    inspections = query.all()

    res = []
    for insp in inspections:
        item = InspectionResponse.model_validate(insp)
        item.item_code = insp.item.item_code
        item.batch_number = insp.batch.batch_number
        item.inspector_name = insp.inspector.full_name
        res.append(item)
    return res

@router.get("/inspections/{inspection_id}", response_model=InspectionResponse)
def get_inspection_detail(inspection_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    insp = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    res = InspectionResponse.model_validate(insp)
    res.item_code = insp.item.item_code
    res.batch_number = insp.batch.batch_number
    res.inspector_name = insp.inspector.full_name
    return res

@router.post("/inspections/upload", response_model=InspectionResponse)
async def upload_inspection_with_image(
    batch_id: int = Form(...),
    item_id: int = Form(...),
    inspection_type: str = Form("INITIAL"),
    observations: str = Form(""),
    sample_type: str = Form("ITEM"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(RequireRole(["INSPECTOR", "SUPERVISOR", "QUALITY_MANAGER"]))
):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    item = db.query(InspectionItem).filter(InspectionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inspection item not found")

    # 1. Save uploaded file
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in [".jpg", ".jpeg", ".png"]:
        raise HTTPException(status_code=400, detail="Unsupported image format. Allowed: .jpg, .jpeg, .png")

    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    saved_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    
    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(saved_path)

    # 2. Image Quality Heuristic (Blur & Illumination check)
    quality_status, blur_score = MetalDefectMLService.assess_image_quality(saved_path)

    # 3. Create Inspection Record
    insp = Inspection(
        item_id=item.id,
        batch_id=batch.id,
        inspector_id=current_user.id,
        inspection_type=inspection_type,
        observations=observations,
        status="PENDING_REVIEW"
    )
    db.add(insp)
    db.commit()
    db.refresh(insp)

    # 4. Create Image Record
    img_rec = InspectionImage(
        inspection_id=insp.id,
        file_path=saved_path,
        original_filename=file.filename,
        mime_type=file.content_type or "image/jpeg",
        file_size=file_size,
        quality_status=quality_status,
        blur_score=blur_score
    )
    db.add(img_rec)
    db.commit()
    db.refresh(img_rec)

    # 5. Run Machine Learning Inference Pipeline
    ml_output = MetalDefectMLService.run_inference(saved_path)
    ml_rec = MLResult(
        image_id=img_rec.id,
        model_name=ml_output["model_name"],
        model_version=ml_output["model_version"],
        predicted_class=ml_output["predicted_class"],
        confidence_score=ml_output["confidence_score"],
        anomaly_score=ml_output["anomaly_score"],
        processing_time_ms=ml_output["processing_time_ms"],
        raw_output_json=json.dumps(ml_output["raw_output"])
    )
    db.add(ml_rec)

    # Update item status
    item.status = "INSPECTED"
    db.commit()

    log_audit(db, current_user, "Inspection", f"INS-{insp.id}", "CREATE", 
              f"Uploaded image {file.filename} (Quality: {quality_status}, ML: {ml_output['predicted_class']})")

    db.refresh(insp)
    res = InspectionResponse.model_validate(insp)
    res.item_code = item.item_code
    res.batch_number = batch.batch_number
    res.inspector_name = current_user.full_name
    return res


# ==========================================
# 5. HUMAN REVIEW (CONFIRM / CHALLENGE AI)
# ==========================================
@router.post("/reviews", response_model=HumanReviewResponse)
def submit_human_review(
    data: HumanReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RequireRole(["INSPECTOR", "QUALITY_MANAGER"]))
):
    insp = db.query(Inspection).filter(Inspection.id == data.inspection_id).first()
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")

    if not data.rationale_notes.strip():
        raise HTTPException(status_code=400, detail="Mandatory review explanation required.")

    # Get ML result if available
    latest_img = insp.images[-1] if insp.images else None
    ml_res_id = latest_img.ml_result.id if (latest_img and latest_img.ml_result) else None

    # Check for existing review
    existing_rev = db.query(HumanReview).filter(HumanReview.inspection_id == insp.id).first()
    if existing_rev:
        raise HTTPException(status_code=400, detail="Inspection has already been reviewed.")

    rev = HumanReview(
        inspection_id=insp.id,
        ml_result_id=ml_res_id,
        reviewer_id=current_user.id,
        review_status=data.review_status,
        final_verdict=data.final_verdict,
        human_category=data.human_category if data.final_verdict == "DEFECT_CONFIRMED" else None,
        rationale_notes=data.rationale_notes
    )
    db.add(rev)
    db.commit()
    db.refresh(rev)

    # If Defect Confirmed -> automatically register Defect Ticket
    if data.final_verdict == "DEFECT_CONFIRMED":
        defect_code = f"DEF-{uuid.uuid4().hex[:6].upper()}"
        defect = Defect(
            inspection_id=insp.id,
            review_id=rev.id,
            defect_code=defect_code,
            defect_category=data.human_category or "Unspecified_Defect",
            severity=data.severity or "MAJOR",
            status="OPEN",
            description=f"Confirmed by {current_user.full_name}: {data.rationale_notes}"
        )
        db.add(defect)
        insp.item.status = "DEFECT_FOUND"
        insp.status = "REVIEWED"
    else:
        insp.item.status = "PASSED"
        insp.status = "REVIEWED"

    db.commit()

    log_audit(db, current_user, "HumanReview", f"REV-{rev.id}", "STATUS_CHANGE",
              f"Review Verdict: {data.final_verdict} (Status: {data.review_status}) for Inspection INS-{insp.id}")

    resp = HumanReviewResponse.model_validate(rev)
    resp.reviewer_name = current_user.full_name
    return resp


# ==========================================
# 6. DEFECTS & CORRECTIVE ACTIONS
# ==========================================
@router.get("/defects", response_model=List[DefectResponse])
def get_defects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    defects = db.query(Defect).order_by(desc(Defect.created_at)).all()
    res = []
    for d in defects:
        item = DefectResponse.model_validate(d)
        item.batch_number = d.inspection.batch.batch_number
        item.item_code = d.inspection.item.item_code
        if d.inspection.images:
            item.image_url = f"/api/images/{os.path.basename(d.inspection.images[0].file_path)}"
        res.append(item)
    return res

@router.get("/corrective-actions", response_model=List[CorrectiveActionResponse])
def get_corrective_actions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    actions = db.query(CorrectiveAction).order_by(desc(CorrectiveAction.created_at)).all()
    res = []
    for a in actions:
        item = CorrectiveActionResponse.model_validate(a)
        item.defect_code = a.defect.defect_code
        item.assigned_to_name = a.assigned_to.full_name
        res.append(item)
    return res

@router.post("/corrective-actions", response_model=CorrectiveActionResponse)
def create_corrective_action(
    data: CorrectiveActionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RequireRole(["SUPERVISOR", "QUALITY_MANAGER"]))
):
    defect = db.query(Defect).filter(Defect.id == data.defect_id).first()
    if not defect:
        raise HTTPException(status_code=404, detail="Defect not found")

    assignee = db.query(User).filter(User.id == data.assigned_to_id).first()
    if not assignee:
        raise HTTPException(status_code=404, detail="Assigned user not found")

    action = CorrectiveAction(
        defect_id=defect.id,
        assigned_to_id=assignee.id,
        target_date=data.target_date,
        action_plan=data.action_plan,
        status="PENDING"
    )
    defect.status = "IN_PROGRESS"
    db.add(action)
    db.commit()
    db.refresh(action)

    log_audit(db, current_user, "CorrectiveAction", f"ACT-{action.id}", "CREATE",
              f"Assigned action for {defect.defect_code} to {assignee.full_name}")

    resp = CorrectiveActionResponse.model_validate(action)
    resp.defect_code = defect.defect_code
    resp.assigned_to_name = assignee.full_name
    return resp

@router.put("/corrective-actions/{action_id}", response_model=CorrectiveActionResponse)
def update_corrective_action(
    action_id: int,
    data: CorrectiveActionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RequireRole(["SUPERVISOR", "QUALITY_MANAGER"]))
):
    action = db.query(CorrectiveAction).filter(CorrectiveAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    if data.work_performed:
        action.work_performed = data.work_performed
    if data.status:
        action.status = data.status
        if data.status == "COMPLETED":
            action.completed_at = datetime.now(timezone.utc)
            action.defect.status = "PENDING_REINSPECTION"

    db.commit()
    db.refresh(action)
    log_audit(db, current_user, "CorrectiveAction", f"ACT-{action.id}", "UPDATE", f"Updated status to {action.status}")

    resp = CorrectiveActionResponse.model_validate(action)
    resp.defect_code = action.defect.defect_code
    resp.assigned_to_name = action.assigned_to.full_name
    return resp


# ==========================================
# 7. REINSPECTION (CLOSE / REOPEN DEFECT)
# ==========================================
@router.post("/reinspections", response_model=ReinspectionResponse)
def record_reinspection(
    data: ReinspectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RequireRole(["INSPECTOR", "SUPERVISOR", "QUALITY_MANAGER"]))
):
    action = db.query(CorrectiveAction).filter(CorrectiveAction.id == data.corrective_action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Corrective action not found")

    defect = db.query(Defect).filter(Defect.id == data.defect_id).first()
    if not defect:
        raise HTTPException(status_code=404, detail="Defect not found")

    reinsp = Reinspection(
        corrective_action_id=action.id,
        defect_id=defect.id,
        outcome=data.outcome,
        notes=data.notes
    )
    db.add(reinsp)

    # Immutability rule: Never delete earlier findings, update status appropriately
    if data.outcome == "PASSED_CLOSED":
        defect.status = "CLOSED"
        defect.inspection.item.status = "PASSED"
    else:
        defect.status = "REOPENED"
        defect.inspection.item.status = "DEFECT_FOUND"

    db.commit()
    db.refresh(reinsp)

    log_audit(db, current_user, "Defect", defect.defect_code, "REINSPECTION",
              f"Reinspection outcome: {data.outcome}. Notes: {data.notes}")

    return reinsp


# ==========================================
# 8. BATCH DECISION (HOLD / RELEASE)
# RESTRICTED: QUALITY_MANAGER ONLY
# ==========================================
@router.post("/batch-decisions", response_model=BatchDecisionResponse)
def record_batch_decision(
    data: BatchDecisionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RequireRole(["QUALITY_MANAGER"]))
):
    batch = db.query(Batch).filter(Batch.id == data.batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Calculate audited figures
    total_inspected = db.query(Inspection).filter(Inspection.batch_id == batch.id).count()
    total_reviewed = db.query(HumanReview).join(Inspection).filter(Inspection.batch_id == batch.id).count()
    defects_found = db.query(Defect).join(Inspection).filter(Inspection.batch_id == batch.id).count()

    if data.decision == "BATCH_RELEASE":
        # Check for open defects
        open_defects = db.query(Defect).join(Inspection).filter(
            Inspection.batch_id == batch.id,
            Defect.status.in_(["OPEN", "IN_PROGRESS", "REOPENED", "PENDING_REINSPECTION"])
        ).count()
        if open_defects > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot release batch: {open_defects} unresolved defect ticket(s) are still active."
            )
        batch.status = "RELEASED"
    elif data.decision == "BATCH_HOLD":
        batch.status = "ON_HOLD"
    elif data.decision == "BATCH_REJECT":
        batch.status = "REJECTED"

    decision = BatchDecision(
        batch_id=batch.id,
        decided_by_id=current_user.id,
        decision=data.decision,
        total_inspected=total_inspected,
        total_reviewed=total_reviewed,
        defects_found=defects_found,
        justification=data.justification
    )
    db.add(decision)
    db.commit()
    db.refresh(decision)

    log_audit(db, current_user, "Batch", batch.batch_number, "DISPOSITION",
              f"Quality Manager recorded disposition {data.decision}: {data.justification}")

    resp = BatchDecisionResponse.model_validate(decision)
    resp.decided_by_name = current_user.full_name
    return resp


# ==========================================
# 9. DASHBOARD & SYSTEM METRICS
# ==========================================
@router.get("/dashboard")
def get_dashboard_metrics(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_batches = db.query(Batch).count()
    total_items = db.query(InspectionItem).count()
    total_inspections = db.query(Inspection).count()
    pending_reviews = db.query(Inspection).filter(Inspection.status == "PENDING_REVIEW").count()
    confirmed_defects = db.query(Defect).count()
    open_actions = db.query(CorrectiveAction).filter(CorrectiveAction.status != "COMPLETED").count()

    # Defect category distribution
    defects = db.query(Defect).all()
    categories = {}
    for d in defects:
        categories[d.defect_category] = categories.get(d.defect_category, 0) + 1

    # Recent activity
    recent_audits = db.query(AuditLog).order_by(desc(AuditLog.timestamp)).limit(8).all()

    return {
        "summary": {
            "total_batches": total_batches,
            "total_items": total_items,
            "total_inspections": total_inspections,
            "pending_reviews": pending_reviews,
            "confirmed_defects": confirmed_defects,
            "open_actions": open_actions,
            "inspection_coverage_pct": round((total_inspections / total_items * 100), 1) if total_items > 0 else 0.0
        },
        "defect_distribution": categories,
        "recent_activity": [
            {
                "actor": a.actor_name,
                "role": a.actor_role,
                "action": a.action_type,
                "entity": f"{a.entity_name} ({a.entity_id})",
                "reason": a.reason,
                "time": a.timestamp.strftime("%Y-%m-%d %H:%M")
            }
            for a in recent_audits
        ]
    }


# ==========================================
# 10. GROUNDED GENAI QUALITY ASSISTANT
# ==========================================
@router.post("/genai/query", response_model=GenAIQueryResponse)
def query_genai_assistant(
    data: GenAIQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = GroundedGenAIService.process_query(db, current_user, data.prompt, data.batch_number)
    return result


# ==========================================
# 11. ML HELD-OUT EVALUATION SUITE
# ==========================================
@router.get("/ml/evaluate")
def evaluate_ml_model(current_user: User = Depends(get_current_user)):
    return MLEvaluationSuite.run_evaluation(settings.EVAL_DATASET_DIR)


# ==========================================
# 12. TEAM INNOVATION (CRDM & AGREEMENT)
# ==========================================
@router.get("/innovation/triage")
def get_innovation_triage_queue(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return InnovationCRDMService.get_triage_queue(db)

@router.get("/innovation/agreement")
def get_inspector_agreement_analytics(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return InnovationCRDMService.get_inspector_agreement_analytics(db)


# ==========================================
# 13. AUDIT TRAIL LOGS
# ==========================================
@router.get("/audit-logs", response_model=List[AuditLogResponse])
def get_audit_trail(db: Session = Depends(get_db), current_user: User = Depends(RequireRole(["QUALITY_MANAGER"]))):
    return db.query(AuditLog).order_by(desc(AuditLog.timestamp)).limit(50).all()
