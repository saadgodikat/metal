import os
import json
import random
from datetime import datetime, timedelta, timezone
from PIL import Image, ImageDraw, ImageFilter
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.security import get_password_hash
from backend.app.models.entities import (
    User, Product, Batch, InspectionItem, Inspection, InspectionImage,
    MLResult, HumanReview, Defect, CorrectiveAction, Reinspection, BatchDecision, AuditLog
)
from backend.app.services.ml_service import MetalDefectMLService

def create_sample_image(category: str, filepath: str, is_blurred: bool = False):
    """
    Synthesize realistic metal part inspection images with authentic textures,
    gradients, and visual defect features for machine vision testing.
    """
    width, height = 300, 300
    # Base metallic gray background with subtle radial gradient
    img = Image.new('RGB', (width, height), color=(140, 142, 148))
    draw = ImageDraw.Draw(img)

    # Add metallic brushed finish lines
    for y in range(0, height, 4):
        tint = random.randint(-8, 8)
        c = (140 + tint, 142 + tint, 148 + tint)
        draw.line([(0, y), (width, y)], fill=c, width=1)

    # Outer cylindrical flange edge ring
    draw.ellipse([20, 20, 280, 280], outline=(100, 102, 108), width=3)
    draw.ellipse([80, 80, 220, 220], outline=(110, 112, 118), width=2)

    if category == "Scratch":
        # Sharp high-contrast directional scratch
        draw.line([(60, 90), (220, 210)], fill=(40, 40, 45), width=3)
        draw.line([(61, 91), (221, 211)], fill=(220, 225, 230), width=1)  # highlight
    elif category == "Porosity":
        # Cluster of dark pit casting blowholes
        for _ in range(12):
            px = random.randint(110, 190)
            py = random.randint(110, 190)
            radius = random.randint(2, 6)
            draw.ellipse([px-radius, py-radius, px+radius, py+radius], fill=(25, 25, 30))
    elif category == "Dent":
        # Shaded radial depression
        for r in range(35, 5, -5):
            alpha = int(140 - (35 - r) * 3)
            draw.ellipse([120-r, 140-r, 120+r, 140+r], fill=(alpha, alpha, alpha+4))
    elif category == "Corrosion":
        # Reddish-brown oxidation patch
        for _ in range(25):
            cx = random.randint(100, 200)
            cy = random.randint(100, 200)
            rad = random.randint(8, 22)
            draw.ellipse([cx-rad, cy-rad, cx+rad, cy+rad], fill=(175, 95, 45, 128))
    
    # If blurred, apply strong Gaussian blur
    if is_blurred:
        img = img.filter(ImageFilter.GaussianBlur(radius=8))

    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    img.save(filepath, format="JPEG", quality=90)
    return filepath


def seed_database(db: Session):
    """
    Populate database with initial roles, products, batches, inspections,
    evaluation dataset, and audit trails.
    """
    # 1. Seed Users
    if db.query(User).count() == 0:
        users = [
            User(
                username="inspector_mike",
                email="mike.inspector@factory.com",
                hashed_password=get_password_hash("password123"),
                full_name="Mike Vance (Inspector)",
                role="INSPECTOR",
                is_active=True
            ),
            User(
                username="supervisor_sarah",
                email="sarah.supervisor@factory.com",
                hashed_password=get_password_hash("password123"),
                full_name="Sarah Jenkins (Production Supervisor)",
                role="SUPERVISOR",
                is_active=True
            ),
            User(
                username="manager_elena",
                email="elena.manager@factory.com",
                hashed_password=get_password_hash("password123"),
                full_name="Elena Rostova (Quality Manager)",
                role="QUALITY_MANAGER",
                is_active=True
            )
        ]
        db.add_all(users)
        db.commit()

    inspector = db.query(User).filter(User.role == "INSPECTOR").first()
    supervisor = db.query(User).filter(User.role == "SUPERVISOR").first()
    manager = db.query(User).filter(User.role == "QUALITY_MANAGER").first()

    # 2. Seed Products
    if db.query(Product).count() == 0:
        products = [
            Product(
                product_code="PRD-FLANGE-50",
                name="High-Pressure Flange 50mm",
                category="Precision Machined Metal Parts",
                description="Forged carbon-steel flange designed for hydraulic pressure joints."
            ),
            Product(
                product_code="PRD-BRACKET-X2",
                name="Aerospace Structural Bracket X-2",
                category="Precision Machined Metal Parts",
                description="Lightweight high-tensile stamped aluminium mounting bracket."
            )
        ]
        db.add_all(products)
        db.commit()

    flange = db.query(Product).filter(Product.product_code == "PRD-FLANGE-50").first()
    bracket = db.query(Product).filter(Product.product_code == "PRD-BRACKET-X2").first()

    # 3. Seed Batches
    if db.query(Batch).count() == 0:
        batches = [
            Batch(
                product_id=flange.id,
                batch_number="B-101",
                quantity=150,
                status="UNDER_REVIEW",
                manufactured_date=datetime.now(timezone.utc) - timedelta(days=2),
                notes="Initial production run from CNC Lathe Line 3."
            ),
            Batch(
                product_id=flange.id,
                batch_number="B-102",
                quantity=200,
                status="PENDING_INSPECTION",
                manufactured_date=datetime.now(timezone.utc) - timedelta(days=1),
                notes="Morning shift batch. Undergoing sampling."
            ),
            Batch(
                product_id=bracket.id,
                batch_number="B-201",
                quantity=80,
                status="RELEASED",
                manufactured_date=datetime.now(timezone.utc) - timedelta(days=5),
                notes="Passed quality gate and approved for delivery."
            )
        ]
        db.add_all(batches)
        db.commit()

    b101 = db.query(Batch).filter(Batch.batch_number == "B-101").first()

    # 4. Seed Inspection Items & Multi-Image Inspections
    if db.query(InspectionItem).count() == 0:
        # Item 1: Flange with Scratch defect
        item1 = InspectionItem(batch_id=b101.id, item_code="ITM-B101-001", sample_type="ITEM", status="DEFECT_FOUND")
        # Item 2: Flange with Nominal Pass
        item2 = InspectionItem(batch_id=b101.id, item_code="ITM-B101-002", sample_type="ITEM", status="PASSED")
        # Item 3: Flange with Porosity (Pending human review)
        item3 = InspectionItem(batch_id=b101.id, item_code="ITM-B101-003", sample_type="ITEM", status="PENDING")
        db.add_all([item1, item2, item3])
        db.commit()

        # Create images & inspections
        # Inspection 1 (Item 1 - Confirmed Scratch)
        img1_path = os.path.join(settings.UPLOAD_DIR, "b101_item1_scratch.jpg")
        create_sample_image("Scratch", img1_path)
        
        insp1 = Inspection(
            item_id=item1.id,
            batch_id=b101.id,
            inspector_id=inspector.id,
            inspection_type="INITIAL",
            observations="Noticed score mark across sealing face during visual station pass.",
            status="REVIEWED"
        )
        db.add(insp1)
        db.commit()

        img1_rec = InspectionImage(
            inspection_id=insp1.id,
            file_path=img1_path,
            original_filename="b101_item1_scratch.jpg",
            mime_type="image/jpeg",
            file_size=os.path.getsize(img1_path),
            quality_status="OK",
            blur_score=142.5
        )
        db.add(img1_rec)
        db.commit()

        # ML Result for Item 1
        ml_res1 = MetalDefectMLService.run_inference(img1_path)
        ml_rec1 = MLResult(
            image_id=img1_rec.id,
            model_name=ml_res1["model_name"],
            model_version=ml_res1["model_version"],
            predicted_class=ml_res1["predicted_class"],
            confidence_score=ml_res1["confidence_score"],
            anomaly_score=ml_res1["anomaly_score"],
            processing_time_ms=ml_res1["processing_time_ms"],
            raw_output_json=json.dumps(ml_res1["raw_output"])
        )
        db.add(ml_rec1)
        db.commit()

        # Human Review for Item 1
        rev1 = HumanReview(
            inspection_id=insp1.id,
            ml_result_id=ml_rec1.id,
            reviewer_id=inspector.id,
            review_status="CONFIRMED",
            final_verdict="DEFECT_CONFIRMED",
            human_category="Scratch",
            rationale_notes="Confirmed surface score across sealing face. Exceeds 0.2mm tolerance."
        )
        db.add(rev1)
        db.commit()

        # Defect ticket
        def1 = Defect(
            inspection_id=insp1.id,
            review_id=rev1.id,
            defect_code="DEF-101",
            defect_category="Scratch",
            severity="MAJOR",
            status="IN_PROGRESS",
            description="Deep machining scratch across carbon-steel flange face."
        )
        db.add(def1)
        db.commit()

        # Corrective action assigned to supervisor
        act1 = CorrectiveAction(
            defect_id=def1.id,
            assigned_to_id=supervisor.id,
            target_date=datetime.now(timezone.utc) + timedelta(days=1),
            action_plan="Perform precision face lap-polishing on lathe 3 to remove scratch depth.",
            work_performed="Polished face with 600-grit diamond compound. Surface roughness verified Ra < 0.4.",
            status="IN_PROGRESS"
        )
        db.add(act1)
        db.commit()

        # Inspection 2 (Item 2 - Nominal Good)
        img2_path = os.path.join(settings.UPLOAD_DIR, "b101_item2_good.jpg")
        create_sample_image("Nominal_Good", img2_path)
        insp2 = Inspection(
            item_id=item2.id,
            batch_id=b101.id,
            inspector_id=inspector.id,
            inspection_type="INITIAL",
            observations="Clean machined surface, no anomalies detected.",
            status="REVIEWED"
        )
        db.add(insp2)
        db.commit()

        img2_rec = InspectionImage(
            inspection_id=insp2.id,
            file_path=img2_path,
            original_filename="b101_item2_good.jpg",
            file_size=os.path.getsize(img2_path),
            quality_status="OK",
            blur_score=110.0
        )
        db.add(img2_rec)
        db.commit()

        ml_res2 = MetalDefectMLService.run_inference(img2_path)
        ml_rec2 = MLResult(
            image_id=img2_rec.id,
            model_name=ml_res2["model_name"],
            model_version=ml_res2["model_version"],
            predicted_class=ml_res2["predicted_class"],
            confidence_score=ml_res2["confidence_score"],
            anomaly_score=ml_res2["anomaly_score"],
            processing_time_ms=ml_res2["processing_time_ms"],
            raw_output_json=json.dumps(ml_res2["raw_output"])
        )
        db.add(ml_rec2)
        db.commit()

        rev2 = HumanReview(
            inspection_id=insp2.id,
            ml_result_id=ml_rec2.id,
            reviewer_id=inspector.id,
            review_status="CONFIRMED",
            final_verdict="NO_DEFECT",
            human_category="None",
            rationale_notes="Surface finish within specifications; verified good."
        )
        db.add(rev2)
        db.commit()

        # Inspection 3 (Item 3 - Porosity, Pending Review)
        img3_path = os.path.join(settings.UPLOAD_DIR, "b101_item3_porosity.jpg")
        create_sample_image("Porosity", img3_path)
        insp3 = Inspection(
            item_id=item3.id,
            batch_id=b101.id,
            inspector_id=inspector.id,
            inspection_type="INITIAL",
            observations="Micro-void clusters visible under fluorescent lighting.",
            status="PENDING_REVIEW"
        )
        db.add(insp3)
        db.commit()

        img3_rec = InspectionImage(
            inspection_id=insp3.id,
            file_path=img3_path,
            original_filename="b101_item3_porosity.jpg",
            file_size=os.path.getsize(img3_path),
            quality_status="OK",
            blur_score=160.0
        )
        db.add(img3_rec)
        db.commit()

        ml_res3 = MetalDefectMLService.run_inference(img3_path)
        ml_rec3 = MLResult(
            image_id=img3_rec.id,
            model_name=ml_res3["model_name"],
            model_version=ml_res3["model_version"],
            predicted_class=ml_res3["predicted_class"],
            confidence_score=ml_res3["confidence_score"],
            anomaly_score=ml_res3["anomaly_score"],
            processing_time_ms=ml_res3["processing_time_ms"],
            raw_output_json=json.dumps(ml_res3["raw_output"])
        )
        db.add(ml_rec3)
        db.commit()

    # 5. Populate Held-Out Evaluation Dataset in eval_dataset/
    eval_dir = settings.EVAL_DATASET_DIR
    classes = ["Nominal_Good", "Scratch", "Dent", "Porosity", "Corrosion"]
    for c in classes:
        for idx in range(1, 4):
            fname = f"{c}_eval_{idx}.jpg"
            fpath = os.path.join(eval_dir, fname)
            if not os.path.exists(fpath):
                create_sample_image(c, fpath)

    # Add a blurred image for testing negative blur detection
    blur_path = os.path.join(eval_dir, "Blurred_test_sample.jpg")
    if not os.path.exists(blur_path):
        create_sample_image("Nominal_Good", blur_path, is_blurred=True)

    # 6. Seed Initial Audit Log
    if db.query(AuditLog).count() == 0:
        logs = [
            AuditLog(
                actor_name="Elena Rostova",
                actor_role="QUALITY_MANAGER",
                entity_name="Batch",
                entity_id="B-201",
                action_type="DISPOSITION",
                reason="All items inspected and verified nominal pass. Approved for shipment.",
                details_json=json.dumps({"decision": "BATCH_RELEASE", "items_inspected": 25, "defects": 0})
            ),
            AuditLog(
                actor_name="Mike Vance",
                actor_role="INSPECTOR",
                entity_name="Inspection",
                entity_id="INS-1",
                action_type="CREATE",
                reason="Uploaded optical inspection photo for item ITM-B101-001.",
                details_json=json.dumps({"item_code": "ITM-B101-001", "batch": "B-101"})
            )
        ]
        db.add_all(logs)
        db.commit()
