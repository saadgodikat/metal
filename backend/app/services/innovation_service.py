from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.models.entities import (
    Inspection, HumanReview, MLResult, InspectionImage, User, Defect, Batch
)

class InnovationCRDMService:
    """
    Team Innovation Feature: Confidence-Risk Discrepancy Matrix (CRDM) & Smart Triage.
    Solves automation bias, highlights high-risk items, and monitors inspector agreement trends.
    """

    @classmethod
    def get_triage_queue(cls, db: Session) -> List[Dict[str, Any]]:
        """
        Rank unreviewed inspections by Audit Priority Index (APIx).
        """
        pending_inspections = db.query(Inspection).filter(
            Inspection.status.in_(["PENDING_REVIEW", "EVIDENCE_REQUESTED"])
        ).all()

        triage_list = []
        for insp in pending_inspections:
            # Get latest image & ML result
            latest_img = insp.images[-1] if insp.images else None
            ml_res = latest_img.ml_result if latest_img else None

            anomaly_score = ml_res.anomaly_score if ml_res else 0.5
            confidence = ml_res.confidence_score if ml_res else 0.5
            
            # Historical defect rate for batch
            batch_defect_count = db.query(Defect).join(Inspection).filter(Inspection.batch_id == insp.batch_id).count()
            batch_risk_factor = min(1.0, batch_defect_count * 0.2)

            # Uncertainty factor: peak uncertainty near confidence = 0.5
            uncertainty_factor = 1.0 - abs(confidence - 0.5) * 2.0

            # Audit Priority Index (APIx) from 0 to 100
            apix = (anomaly_score * 0.50 + batch_risk_factor * 0.30 + uncertainty_factor * 0.20) * 100.0

            priority_tier = "CRITICAL" if apix >= 75 else ("HIGH" if apix >= 50 else ("MEDIUM" if apix >= 30 else "LOW"))

            triage_list.append({
                "inspection_id": insp.id,
                "batch_number": insp.batch.batch_number,
                "item_code": insp.item.item_code,
                "inspector_name": insp.inspector.full_name,
                "predicted_class": ml_res.predicted_class if ml_res else "Pending_ML",
                "confidence_score": round(confidence, 3),
                "anomaly_score": round(anomaly_score, 3),
                "apix_score": round(apix, 1),
                "priority_tier": priority_tier,
                "quality_status": latest_img.quality_status if latest_img else "UNKNOWN",
                "created_at": insp.created_at.strftime("%Y-%m-%d %H:%M")
            })

        # Sort highest priority first
        triage_list.sort(key=lambda x: x["apix_score"], reverse=True)
        return triage_list

    @classmethod
    def get_inspector_agreement_analytics(cls, db: Session) -> Dict[str, Any]:
        """
        Analyze inspector vs AI agreement patterns and detect automation bias.
        """
        reviews = db.query(HumanReview).join(MLResult, HumanReview.ml_result_id == MLResult.id).all()
        
        total_reviews = len(reviews)
        if total_reviews == 0:
            return {
                "total_comparisons": 0,
                "overall_agreement_rate": 100.0,
                "ai_confirmed_rate": 0.0,
                "ai_corrected_rate": 0.0,
                "dual_check_discrepancies": 0,
                "inspector_breakdown": [],
                "discrepancy_matrix": {}
            }

        confirmed_count = sum(1 for r in reviews if r.review_status == "CONFIRMED")
        corrected_count = sum(1 for r in reviews if r.review_status == "CORRECTED")
        
        # Dual-check discrepancies: AI found anomaly (> 0.70), but human passed without defect
        discrepancies = []
        for r in reviews:
            if r.ml_result and r.ml_result.anomaly_score > 0.70 and r.final_verdict == "NO_DEFECT":
                discrepancies.append({
                    "review_id": r.id,
                    "inspection_id": r.inspection_id,
                    "reviewer": r.reviewer.full_name,
                    "ai_class": r.ml_result.predicted_class,
                    "anomaly_score": r.ml_result.anomaly_score,
                    "notes": r.rationale_notes
                })

        # Breakdown by inspector
        inspectors = db.query(User).filter(User.role.in_(["INSPECTOR", "QUALITY_MANAGER"])).all()
        inspector_breakdown = []
        for u in inspectors:
            u_reviews = [r for r in reviews if r.reviewer_id == u.id]
            if u_reviews:
                u_confirmed = sum(1 for r in u_reviews if r.review_status == "CONFIRMED")
                u_corrected = sum(1 for r in u_reviews if r.review_status == "CORRECTED")
                agreement_pct = round((u_confirmed / len(u_reviews)) * 100.0, 1)
                inspector_breakdown.append({
                    "inspector_id": u.id,
                    "inspector_name": u.full_name,
                    "total_reviews": len(u_reviews),
                    "confirmed": u_confirmed,
                    "corrected": u_corrected,
                    "agreement_pct": agreement_pct
                })

        return {
            "total_comparisons": total_reviews,
            "overall_agreement_rate": round((confirmed_count / total_reviews) * 100.0, 1),
            "ai_confirmed_count": confirmed_count,
            "ai_corrected_count": corrected_count,
            "dual_check_discrepancies": len(discrepancies),
            "discrepant_cases": discrepancies,
            "inspector_breakdown": inspector_breakdown
        }
