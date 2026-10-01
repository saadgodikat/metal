from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

# Auth
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Products
class ProductCreate(BaseModel):
    product_code: str
    name: str
    category: str = "Precision Metal Parts"
    description: Optional[str] = None

class ProductResponse(BaseModel):
    id: int
    product_code: str
    name: str
    category: str
    description: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Batches
class BatchCreate(BaseModel):
    product_id: int
    batch_number: str
    quantity: int = 100
    manufactured_date: Optional[datetime] = None
    notes: Optional[str] = None

class BatchUpdate(BaseModel):
    status: Optional[str] = None
    quantity: Optional[int] = None
    notes: Optional[str] = None

class BatchResponse(BaseModel):
    id: int
    product_id: int
    batch_number: str
    quantity: int
    status: str
    manufactured_date: datetime
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    product_name: Optional[str] = None
    product_code: Optional[str] = None
    inspected_count: Optional[int] = 0
    defect_count: Optional[int] = 0

    class Config:
        from_attributes = True

# Inspection Item
class InspectionItemCreate(BaseModel):
    batch_id: int
    item_code: str
    sample_type: str = "ITEM"  # ITEM, SURFACE, BATCH_SAMPLE

class InspectionItemResponse(BaseModel):
    id: int
    batch_id: int
    item_code: str
    sample_type: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# ML Result
class MLResultResponse(BaseModel):
    id: int
    image_id: int
    model_name: str
    model_version: str
    predicted_class: str
    confidence_score: float
    anomaly_score: float
    processing_time_ms: float
    raw_output_json: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Inspection Image
class InspectionImageResponse(BaseModel):
    id: int
    inspection_id: int
    file_path: str
    original_filename: str
    mime_type: str
    file_size: int
    quality_status: str
    blur_score: float
    created_at: datetime
    ml_result: Optional[MLResultResponse] = None

    class Config:
        from_attributes = True

# Human Review
class HumanReviewCreate(BaseModel):
    inspection_id: int
    review_status: str  # CONFIRMED, CORRECTED, UNCERTAIN, EVIDENCE_REQUESTED
    final_verdict: str  # NO_DEFECT, DEFECT_CONFIRMED
    human_category: Optional[str] = None  # Scratch, Dent, Porosity, Corrosion, None
    severity: Optional[str] = "MAJOR"     # MINOR, MAJOR, CRITICAL
    rationale_notes: str                  # Explanation is mandatory!

class HumanReviewResponse(BaseModel):
    id: int
    inspection_id: int
    ml_result_id: Optional[int]
    reviewer_id: int
    reviewer_name: Optional[str] = None
    review_status: str
    final_verdict: str
    human_category: Optional[str]
    rationale_notes: str
    reviewed_at: datetime

    class Config:
        from_attributes = True

# Defect
class DefectResponse(BaseModel):
    id: int
    inspection_id: int
    review_id: int
    defect_code: str
    defect_category: str
    severity: str
    status: str
    description: str
    created_at: datetime
    updated_at: datetime
    batch_number: Optional[str] = None
    item_code: Optional[str] = None
    image_url: Optional[str] = None

    class Config:
        from_attributes = True

# Corrective Action
class CorrectiveActionCreate(BaseModel):
    defect_id: int
    assigned_to_id: int
    target_date: datetime
    action_plan: str

class CorrectiveActionUpdate(BaseModel):
    work_performed: Optional[str] = None
    status: Optional[str] = None  # PENDING, IN_PROGRESS, COMPLETED

class CorrectiveActionResponse(BaseModel):
    id: int
    defect_id: int
    defect_code: Optional[str] = None
    assigned_to_id: int
    assigned_to_name: Optional[str] = None
    target_date: datetime
    action_plan: str
    work_performed: Optional[str]
    status: str
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True

# Reinspection
class ReinspectionCreate(BaseModel):
    corrective_action_id: int
    defect_id: int
    outcome: str  # PASSED_CLOSED, FAILED_REOPENED
    notes: str

class ReinspectionResponse(BaseModel):
    id: int
    corrective_action_id: int
    defect_id: int
    follow_up_inspection_id: Optional[int]
    outcome: str
    notes: str
    reinspected_at: datetime

    class Config:
        from_attributes = True

# Batch Decision
class BatchDecisionCreate(BaseModel):
    batch_id: int
    decision: str  # BATCH_HOLD, BATCH_RELEASE, BATCH_REJECT
    justification: str

class BatchDecisionResponse(BaseModel):
    id: int
    batch_id: int
    decided_by_id: int
    decided_by_name: Optional[str] = None
    decision: str
    total_inspected: int
    total_reviewed: int
    defects_found: int
    justification: str
    decided_at: datetime

    class Config:
        from_attributes = True

# Inspection
class InspectionResponse(BaseModel):
    id: int
    item_id: int
    item_code: Optional[str] = None
    batch_id: int
    batch_number: Optional[str] = None
    inspector_id: int
    inspector_name: Optional[str] = None
    inspection_type: str
    observations: Optional[str]
    status: str
    created_at: datetime
    images: List[InspectionImageResponse] = []
    human_review: Optional[HumanReviewResponse] = None
    defects: List[DefectResponse] = []

    class Config:
        from_attributes = True

# Audit Log
class AuditLogResponse(BaseModel):
    id: int
    actor_id: Optional[int]
    actor_name: str
    actor_role: str
    entity_name: str
    entity_id: str
    action_type: str
    reason: Optional[str]
    details_json: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True

# GenAI Grounding
class GroundedFact(BaseModel):
    entity_type: str  # BATCH, INSPECTION, DEFECT, ACTION
    entity_id: str
    citation: str
    verified_data: Dict[str, Any]

class GenAIQueryRequest(BaseModel):
    prompt: str
    batch_number: Optional[str] = None

class GenAIQueryResponse(BaseModel):
    prompt: str
    grounded_answer: str
    tool_executed: Optional[str] = None
    citations: List[str] = []
    facts: List[GroundedFact] = []
    security_flag: Optional[str] = None
