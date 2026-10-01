import os
import json
from typing import Dict, Any, List
from backend.app.services.ml_service import MetalDefectMLService

class MLEvaluationSuite:
    """
    Offline Held-Out Evaluation Suite for Model Validation.
    Evaluates MetalDefectVision-ResNet on held-out validation set.
    """
    @classmethod
    def run_evaluation(cls, eval_dir: str) -> Dict[str, Any]:
        classes = MetalDefectMLService.CLASSES
        confusion_matrix = {true_c: {pred_c: 0 for pred_c in classes} for true_c in classes}
        
        sample_results = []
        class_counts = {c: 0 for c in classes}
        
        # Check files in eval_dir
        if not os.path.exists(eval_dir):
            os.makedirs(eval_dir, exist_ok=True)
            
        files = [f for f in os.listdir(eval_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        
        for fname in files:
            # Expected naming convention: <groundtruth>_<sampleid>.png
            parts = fname.split('_')
            true_label = parts[0] if parts[0] in classes else "Nominal_Good"
            class_counts[true_label] += 1
            
            fpath = os.path.join(eval_dir, fname)
            res = MetalDefectMLService.run_inference(fpath)
            pred_label = res["predicted_class"]
            
            if pred_label in classes and true_label in classes:
                confusion_matrix[true_label][pred_label] += 1
                
            sample_results.append({
                "file": fname,
                "ground_truth": true_label,
                "predicted": pred_label,
                "confidence": res["confidence_score"],
                "anomaly_score": res["anomaly_score"],
                "is_correct": (true_label == pred_label)
            })

        total_samples = len(sample_results)
        correct_samples = sum(1 for s in sample_results if s["is_correct"])
        overall_accuracy = (correct_samples / total_samples) if total_samples > 0 else 0.0

        # Compute per-class precision, recall, F1
        metrics_by_class = {}
        for c in classes:
            tp = confusion_matrix[c][c]
            fn = sum(confusion_matrix[c][other] for other in classes if other != c)
            fp = sum(confusion_matrix[other][c] for other in classes if other != c)
            
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
            
            metrics_by_class[c] = {
                "support": class_counts[c],
                "true_positives": tp,
                "false_positives": fp,
                "false_negatives": fn,
                "precision": round(precision, 3),
                "recall": round(recall, 3),
                "f1_score": round(f1, 3)
            }

        success_cases = [s for s in sample_results if s["is_correct"]][:3]
        failure_cases = [s for s in sample_results if not s["is_correct"]][:3]

        return {
            "model_name": MetalDefectMLService.MODEL_NAME,
            "model_version": MetalDefectMLService.MODEL_VERSION,
            "total_evaluated": total_samples,
            "overall_accuracy": round(overall_accuracy, 3),
            "class_counts": class_counts,
            "data_split": "Held-Out Independent Validation Split (Unseen during parameter calibration)",
            "preprocessing": "Grayscale & Laplacian gradient extraction, edge energy, color-tint delta",
            "confusion_matrix": confusion_matrix,
            "per_class_metrics": metrics_by_class,
            "representative_successes": success_cases,
            "representative_failures": failure_cases
        }
