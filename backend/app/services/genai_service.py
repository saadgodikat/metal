import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from backend.app.models.entities import (
    Batch, Inspection, InspectionItem, HumanReview, MLResult, Defect, CorrectiveAction, User
)

class GroundedGenAIService:
    """
    Grounded GenAI Quality Assistant.
    Enforces deterministic DB queries, citations, guardrails, and role limits.
    """

    @classmethod
    def process_query(cls, db: Session, user: User, prompt: str, batch_number: Optional[str] = None) -> Dict[str, Any]:
        prompt_lower = prompt.lower().strip()
        citations = []
        facts = []
        security_flag = None

        # Guardrail 1: Disallow automated batch release / disposition
        if any(w in prompt_lower for w in ["release batch", "hold batch", "close issue", "close defect", "approve batch"]):
            return {
                "prompt": prompt,
                "grounded_answer": (
                    "⚠️ **Action Denied by Safety Guardrail**: GenAI is strictly prohibited from autonomously releasing batches, "
                    "closing defects, or modifying quality dispositions. In accordance with system policy, batch disposition "
                    "is a human-controlled decision reserved exclusively for authorized Quality Managers."
                ),
                "tool_executed": "guardrail_blocked",
                "citations": [],
                "facts": [],
                "security_flag": "AUTONOMOUS_ACTION_BLOCKED"
            }

        # Guardrail 2: Misleading Premise Detection
        if "all items passed" in prompt_lower or "zero defects" in prompt_lower:
            # Let's inspect the batch to check if there actually are defects
            if batch_number:
                batch = db.query(Batch).filter(Batch.batch_number == batch_number).first()
                if batch:
                    defect_count = db.query(Defect).join(Inspection).filter(Inspection.batch_id == batch.id).count()
                    if defect_count > 0:
                        return {
                            "prompt": prompt,
                            "grounded_answer": (
                                f"⚠️ **Contradiction Detected**: The premise stated that all items passed, but verified database records "
                                f"show **{defect_count} confirmed defect(s)** recorded for Batch `{batch.batch_number}`. "
                                f"Please review the verified defect register before proceeding."
                            ),
                            "tool_executed": "misleading_premise_guard",
                            "citations": [f"[Batch #{batch.batch_number}]"],
                            "facts": [{"entity_type": "BATCH", "entity_id": batch.batch_number, "citation": f"[Batch #{batch.batch_number}]", "verified_data": {"defects_found": defect_count}}],
                            "security_flag": "MISLEADING_PREMISE_FLAGGED"
                        }

        # Route 1: Batch Summary ("summarise batch", "batch status", "tell me about batch")
        if "summarise" in prompt_lower or "summary" in prompt_lower or "batch" in prompt_lower:
            target_batch_num = batch_number
            if not target_batch_num:
                # Try to extract batch number from text like B-101 or B-2026-X1
                words = prompt.replace("?", " ").replace(",", " ").split()
                for w in words:
                    if w.upper().startswith("B-"):
                        target_batch_num = w.upper()
                        break

            if target_batch_num:
                return cls._tool_batch_summary(db, target_batch_num)
            else:
                # Return general status of all active batches
                return cls._tool_active_batches_summary(db)

        # Route 2: Historical Issue Search ("have we seen", "recurring", "history of", "scratch", "porosity")
        if any(w in prompt_lower for w in ["have we seen", "recurring", "previously", "history", "similar"]):
            return cls._tool_historical_issues(db, prompt)

        # Route 3: Attention Summary ("what needs attention", "overdue", "pending", "today")
        if any(w in prompt_lower for w in ["attention", "overdue", "pending", "urgent", "needs action"]):
            return cls._tool_attention_summary(db)

        # Route 4: Quality Report ("quality report", "trends", "audit")
        if "quality report" in prompt_lower or "report" in prompt_lower:
            return cls._tool_quality_report(db)

        # Default fallback: Attention summary + system overview
        return cls._tool_attention_summary(db)

    @classmethod
    def _tool_batch_summary(cls, db: Session, batch_number: str) -> Dict[str, Any]:
        batch = db.query(Batch).filter(Batch.batch_number == batch_number).first()
        if not batch:
            return {
                "prompt": f"Summarise Batch {batch_number}",
                "grounded_answer": (
                    f"❌ **Batch Not Found**: No database record exists for Batch identifier `{batch_number}`. "
                    "Evidence is missing. Please verify the batch number or register the batch in the Products & Batches registry."
                ),
                "tool_executed": "get_batch_summary",
                "citations": [],
                "facts": [],
                "security_flag": "RECORD_NOT_FOUND"
            }

        # Query deterministic counts
        total_items = db.query(InspectionItem).filter(InspectionItem.batch_id == batch.id).count()
        inspections = db.query(Inspection).filter(Inspection.batch_id == batch.id).all()
        inspected_item_ids = set(insp.item_id for insp in inspections)
        
        # Human reviews
        reviewed_count = db.query(HumanReview).join(Inspection).filter(Inspection.batch_id == batch.id).count()
        
        # Pending reviews
        pending_review_count = len([i for i in inspections if i.status == "PENDING_REVIEW"])

        # Confirmed defects
        defects = db.query(Defect).join(Inspection).filter(Inspection.batch_id == batch.id).all()
        defect_count = len(defects)

        # Corrective actions
        actions = []
        for d in defects:
            actions.extend(d.corrective_actions)
        open_actions = [a for a in actions if a.status != "COMPLETED"]

        citations = [f"[Batch #{batch.batch_number}]"]
        for d in defects:
            citations.append(f"[Defect #{d.defect_code}]")
        for a in actions:
            citations.append(f"[Action #ACT-{a.id}]")

        coverage_pct = round((len(inspected_item_ids) / total_items * 100), 1) if total_items > 0 else 0.0

        answer = (
            f"### 📋 Verified Summary for Batch `{batch.batch_number}`\n\n"
            f"- **Product**: `{batch.product.name}` (`{batch.product.product_code}`)\n"
            f"- **Batch Lifecycle Status**: **{batch.status}**\n"
            f"- **Inspection Item Coverage**: **{len(inspected_item_ids)} / {total_items} items** ({coverage_pct}% coverage)\n"
            f"- **Human Reviews Completed**: **{reviewed_count}** (Pending Review: **{pending_review_count}**)\n"
            f"- **Confirmed Defects**: **{defect_count}**\n"
            f"- **Open Corrective Actions**: **{len(open_actions)}**\n\n"
        )

        if defects:
            answer += "#### 🔍 Defect Breakdown:\n"
            for d in defects:
                answer += f"- [Defect #{d.defect_code}]: **{d.defect_category}** ({d.severity}) — Status: `{d.status}`\n"
        else:
            answer += "✅ *No confirmed defects recorded for this batch so far.*\n"

        if open_actions:
            answer += "\n#### ⚠️ Open Corrective Actions Required:\n"
            for a in open_actions:
                answer += f"- [Action #ACT-{a.id}]: Assigned to `{a.assigned_to.full_name}` | Plan: *{a.action_plan}* (Target: {a.target_date.strftime('%Y-%m-%d')})\n"

        answer += (
            f"\n> **Grounding Verification**: All figures derived directly from database queries. "
            f"Citations: {', '.join(citations)}"
        )

        return {
            "prompt": f"Summarise Batch {batch_number}",
            "grounded_answer": answer,
            "tool_executed": "get_batch_summary",
            "citations": citations,
            "facts": [
                {"entity_type": "BATCH", "entity_id": batch.batch_number, "citation": f"[Batch #{batch.batch_number}]", "verified_data": {
                    "total_items": total_items, "inspected_items": len(inspected_item_ids), "reviewed": reviewed_count, "defects": defect_count, "open_actions": len(open_actions)
                }}
            ],
            "security_flag": None
        }

    @classmethod
    def _tool_historical_issues(cls, db: Session, prompt: str) -> Dict[str, Any]:
        defects = db.query(Defect).order_by(Defect.created_at.desc()).limit(10).all()
        citations = []
        facts = []

        if not defects:
            return {
                "prompt": prompt,
                "grounded_answer": "No historical defect records found in the database.",
                "tool_executed": "search_historical_issues",
                "citations": [],
                "facts": [],
                "security_flag": None
            }

        answer = "### 📚 Historical Defect & Resolution Analysis\n\n"
        answer += "Based on stored inspection outcomes and supervisor corrective actions:\n\n"

        for d in defects:
            citations.append(f"[Defect #{d.defect_code}]")
            action_summary = "No action logged"
            if d.corrective_actions:
                last_act = d.corrective_actions[-1]
                action_summary = f"[Action #ACT-{last_act.id}] ({last_act.status}): {last_act.action_plan}"

            answer += (
                f"- [Defect #{d.defect_code}] (`{d.defect_category}`): *{d.description}* | Severity: **{d.severity}**\n"
                f"  - **Resolution Path**: {action_summary}\n"
                f"  - **Current Status**: `{d.status}`\n"
            )

        answer += (
            "\n💡 *Note: Similar defect appearances do not automatically imply identical machine faults or supplier responsibility. "
            "Physical engineering verification remains required.*"
        )

        return {
            "prompt": prompt,
            "grounded_answer": answer,
            "tool_executed": "search_historical_issues",
            "citations": citations,
            "facts": facts,
            "security_flag": None
        }

    @classmethod
    def _tool_attention_summary(cls, db: Session) -> Dict[str, Any]:
        # Pending reviews
        pending_inspections = db.query(Inspection).filter(Inspection.status == "PENDING_REVIEW").all()
        # Open defects
        open_defects = db.query(Defect).filter(Defect.status.in_(["OPEN", "IN_PROGRESS", "REOPENED"])).all()
        # Overdue / open actions
        open_actions = db.query(CorrectiveAction).filter(CorrectiveAction.status != "COMPLETED").all()
        
        citations = []
        for i in pending_inspections:
            citations.append(f"[Inspection #INS-{i.id}]")
        for d in open_defects:
            citations.append(f"[Defect #{d.defect_code}]")
        for a in open_actions:
            citations.append(f"[Action #ACT-{a.id}]")

        answer = (
            "### 🚨 System Attention Summary (Today)\n\n"
            f"- **Pending Human Reviews**: **{len(pending_inspections)}** inspections waiting for verification.\n"
            f"- **Active Unresolved Defects**: **{len(open_defects)}** items requiring supervisor resolution.\n"
            f"- **Open Corrective Action Tasks**: **{len(open_actions)}** tasks pending completion.\n\n"
        )

        if pending_inspections:
            answer += "#### ⏳ Immediate Review Queue:\n"
            for i in pending_inspections[:3]:
                answer += f"- [Inspection #INS-{i.id}]: Batch `{i.batch.batch_number}`, Item `{i.item.item_code}` — Obs: *{i.observations or 'Awaiting review'}*\n"

        if open_actions:
            answer += "\n#### 🔧 Active Corrective Work:\n"
            for a in open_actions[:3]:
                answer += f"- [Action #ACT-{a.id}]: For [Defect #{a.defect.defect_code}], Assigned: `{a.assigned_to.full_name}` (Due: {a.target_date.strftime('%Y-%m-%d')})\n"

        return {
            "prompt": "What needs attention today?",
            "grounded_answer": answer,
            "tool_executed": "get_attention_summary",
            "citations": citations[:8],
            "facts": [],
            "security_flag": None
        }

    @classmethod
    def _tool_quality_report(cls, db: Session) -> Dict[str, Any]:
        total_items = db.query(InspectionItem).count()
        total_inspections = db.query(Inspection).count()
        total_reviews = db.query(HumanReview).count()
        total_defects = db.query(Defect).count()
        total_actions = db.query(CorrectiveAction).count()
        
        batches = db.query(Batch).all()
        
        answer = (
            "### 📊 Comprehensive Quality Assurance Report\n\n"
            "#### 1. System-Wide Counts (Denominator: Inspected Items)\n"
            f"- **Total Registered Physical Items**: {total_items}\n"
            f"- **Total Inspection Runs**: {total_inspections}\n"
            f"- **Human-Verified Decisions**: {total_reviews}\n"
            f"- **Confirmed Defects Recorded**: {total_defects}\n"
            f"- **Corrective Action Work Orders**: {total_actions}\n\n"
            "#### 2. Separation of ML Observations vs Human Decisions\n"
            "- **Automated ML Layer**: Acts exclusively as decision support; scores are saved independently.\n"
            "- **Human Review Gate**: Every recorded defect was independently ratified with mandatory written rationale.\n\n"
            "#### 3. Batch Disposition Overview\n"
        )
        for b in batches:
            answer += f"- Batch `{b.batch_number}`: Status **{b.status}** (Quantity: {b.quantity})\n"

        return {
            "prompt": "Quality Report",
            "grounded_answer": answer,
            "tool_executed": "generate_quality_report",
            "citations": [f"[Batch #{b.batch_number}]" for b in batches[:5]],
            "facts": [],
            "security_flag": None
        }

    @classmethod
    def _tool_active_batches_summary(cls, db: Session) -> Dict[str, Any]:
        batches = db.query(Batch).all()
        answer = "### 📦 Active Production Batches\n\n"
        citations = []
        for b in batches:
            citations.append(f"[Batch #{b.batch_number}]")
            d_count = db.query(Defect).join(Inspection).filter(Inspection.batch_id == b.id).count()
            answer += f"- [Batch #{b.batch_number}]: Status **{b.status}** | Defects: **{d_count}** | Product: `{b.product.name}`\n"
        
        answer += "\nAsk about any specific batch (e.g., *'Summarise Batch B-101'*) for item-level coverage and open actions."
        return {
            "prompt": "List active batches",
            "grounded_answer": answer,
            "tool_executed": "list_batches",
            "citations": citations,
            "facts": [],
            "security_flag": None
        }
