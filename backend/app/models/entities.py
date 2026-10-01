from datetime import datetime, timezone
import json
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum
)
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(String(30), nullable=False, default="INSPECTOR")  # INSPECTOR, SUPERVISOR, QUALITY_MANAGER
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)

    inspections = relationship("Inspection", back_populates="inspector")
    reviews = relationship("HumanReview", back_populates="reviewer")
    assigned_actions = relationship("CorrectiveAction", back_populates="assigned_to")
    batch_decisions = relationship("BatchDecision", back_populates="decided_by")
    audit_logs = relationship("AuditLog", back_populates="actor")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    product_code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)  # e.g., "Precision Metal Parts"
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    batches = relationship("Batch", back_populates="product", cascade="all, delete-orphan")


class Batch(Base):
    __tablename__ = "batches"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_number = Column(String(50), unique=True, index=True, nullable=False)
    quantity = Column(Integer, default=100)
    status = Column(String(30), default="PENDING_INSPECTION")  # PENDING_INSPECTION, UNDER_REVIEW, ON_HOLD, RELEASED, REJECTED
    manufactured_date = Column(DateTime, default=utc_now)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    product = relationship("Product", back_populates="batches")
    items = relationship("InspectionItem", back_populates="batch", cascade="all, delete-orphan")
    inspections = relationship("Inspection", back_populates="batch")
    decisions = relationship("BatchDecision", back_populates="batch")


class InspectionItem(Base):
    """
    CRITICAL: Count items, not photographs!
    An item can have 1 or more inspection photos.
    """
    __tablename__ = "inspection_items"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    item_code = Column(String(60), index=True, nullable=False)
    sample_type = Column(String(30), default="ITEM")  # ITEM, SURFACE, BATCH_SAMPLE
    status = Column(String(30), default="PENDING")    # PENDING, INSPECTED, DEFECT_FOUND, PASSED
    created_at = Column(DateTime, default=utc_now)

    batch = relationship("Batch", back_populates="items")
    inspections = relationship("Inspection", back_populates="item")


class Inspection(Base):
    __tablename__ = "inspections"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inspection_items.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    inspector_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    inspection_type = Column(String(30), default="INITIAL")  # INITIAL, REINSPECTION
    observations = Column(Text, nullable=True)
    status = Column(String(30), default="PENDING_REVIEW")  # PENDING_REVIEW, REVIEWED, EVIDENCE_REQUESTED
    created_at = Column(DateTime, default=utc_now)

    item = relationship("InspectionItem", back_populates="inspections")
    batch = relationship("Batch", back_populates="inspections")
    inspector = relationship("User", back_populates="inspections")
    images = relationship("InspectionImage", back_populates="inspection", cascade="all, delete-orphan")
    human_review = relationship("HumanReview", back_populates="inspection", uselist=False)
    defects = relationship("Defect", back_populates="inspection")


class InspectionImage(Base):
    __tablename__ = "inspection_images"

    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=False)
    file_path = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    mime_type = Column(String(50), default="image/jpeg")
    file_size = Column(Integer, default=0)
    quality_status = Column(String(30), default="OK")  # OK, BLURRED, LOW_LIGHT, CORRUPTED
    blur_score = Column(Float, default=100.0)
    created_at = Column(DateTime, default=utc_now)

    inspection = relationship("Inspection", back_populates="images")
    ml_result = relationship("MLResult", back_populates="image", uselist=False, cascade="all, delete-orphan")


class MLResult(Base):
    """
    ML Prediction Storage.
    Important: AI Result != Human-confirmed Result.
    """
    __tablename__ = "ml_results"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("inspection_images.id"), nullable=False)
    model_name = Column(String(50), default="MetalDefectVision-ResNet")
    model_version = Column(String(20), default="v1.2.0")
    predicted_class = Column(String(50), nullable=False)  # Nominal_Good, Scratch, Dent, Porosity, Corrosion
    confidence_score = Column(Float, nullable=False)     # True model confidence (0.0 to 1.0)
    anomaly_score = Column(Float, nullable=False)        # Visual anomaly score (0.0 to 1.0)
    processing_time_ms = Column(Float, default=35.0)
    raw_output_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    image = relationship("InspectionImage", back_populates="ml_result")
    human_reviews = relationship("HumanReview", back_populates="ml_result")


class HumanReview(Base):
    """
    Reviewer verifies or challenges AI suggestion.
    """
    __tablename__ = "human_reviews"

    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=False)
    ml_result_id = Column(Integer, ForeignKey("ml_results.id"), nullable=True)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    review_status = Column(String(30), nullable=False)  # CONFIRMED, CORRECTED, UNCERTAIN, EVIDENCE_REQUESTED
    final_verdict = Column(String(30), nullable=False)  # NO_DEFECT, DEFECT_CONFIRMED
    human_category = Column(String(50), nullable=True)  # Scratch, Dent, Porosity, Corrosion, None
    rationale_notes = Column(Text, nullable=False)      # Explanation of decision
    reviewed_at = Column(DateTime, default=utc_now)

    inspection = relationship("Inspection", back_populates="human_review")
    ml_result = relationship("MLResult", back_populates="human_reviews")
    reviewer = relationship("User", back_populates="reviews")
    defect = relationship("Defect", back_populates="review", uselist=False)


class Defect(Base):
    __tablename__ = "defects"

    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=False)
    review_id = Column(Integer, ForeignKey("human_reviews.id"), nullable=False)
    defect_code = Column(String(50), unique=True, index=True, nullable=False)
    defect_category = Column(String(50), nullable=False)  # Scratch, Dent, Porosity, Corrosion
    severity = Column(String(20), default="MAJOR")        # MINOR, MAJOR, CRITICAL
    status = Column(String(30), default="OPEN")           # OPEN, IN_PROGRESS, PENDING_REINSPECTION, CLOSED, REOPENED
    description = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    inspection = relationship("Inspection", back_populates="defects")
    review = relationship("HumanReview", back_populates="defect")
    corrective_actions = relationship("CorrectiveAction", back_populates="defect", cascade="all, delete-orphan")
    reinspections = relationship("Reinspection", back_populates="defect")


class CorrectiveAction(Base):
    __tablename__ = "corrective_actions"

    id = Column(Integer, primary_key=True, index=True)
    defect_id = Column(Integer, ForeignKey("defects.id"), nullable=False)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    target_date = Column(DateTime, nullable=False)
    action_plan = Column(Text, nullable=False)
    work_performed = Column(Text, nullable=True)
    status = Column(String(30), default="PENDING")  # PENDING, IN_PROGRESS, COMPLETED
    created_at = Column(DateTime, default=utc_now)
    completed_at = Column(DateTime, nullable=True)

    defect = relationship("Defect", back_populates="corrective_actions")
    assigned_to = relationship("User", back_populates="assigned_actions")
    reinspections = relationship("Reinspection", back_populates="corrective_action")


class Reinspection(Base):
    __tablename__ = "reinspections"

    id = Column(Integer, primary_key=True, index=True)
    corrective_action_id = Column(Integer, ForeignKey("corrective_actions.id"), nullable=False)
    defect_id = Column(Integer, ForeignKey("defects.id"), nullable=False)
    follow_up_inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=True)
    outcome = Column(String(30), nullable=False)  # PASSED_CLOSED, FAILED_REOPENED
    notes = Column(Text, nullable=False)
    reinspected_at = Column(DateTime, default=utc_now)

    corrective_action = relationship("CorrectiveAction", back_populates="reinspections")
    defect = relationship("Defect", back_populates="reinspections")


class BatchDecision(Base):
    """
    CRITICAL: Separate authorized Quality Manager decision.
    One inspected image does NOT establish the quality of the whole batch.
    """
    __tablename__ = "batch_decisions"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    decided_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    decision = Column(String(30), nullable=False)  # BATCH_HOLD, BATCH_RELEASE, BATCH_REJECT
    total_inspected = Column(Integer, nullable=False)
    total_reviewed = Column(Integer, nullable=False)
    defects_found = Column(Integer, nullable=False)
    justification = Column(Text, nullable=False)
    decided_at = Column(DateTime, default=utc_now)

    batch = relationship("Batch", back_populates="decisions")
    decided_by = relationship("User", back_populates="batch_decisions")


class AuditLog(Base):
    """
    Immutable audit trail for important changes.
    Preserves actor, time, reason, old/new states.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=False)
    entity_name = Column(String(50), nullable=False)
    entity_id = Column(String(50), nullable=False)
    action_type = Column(String(50), nullable=False)  # CREATE, UPDATE, STATUS_CHANGE, DISPOSITION, REINSPECTION
    reason = Column(Text, nullable=True)
    details_json = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=utc_now)

    actor = relationship("User", back_populates="audit_logs")
