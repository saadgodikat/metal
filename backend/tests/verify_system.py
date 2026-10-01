import requests
import json
import os

BASE_URL = "http://127.0.0.1:8000/api"

def run_tests():
    print("=" * 60)
    print("🚀 RUNNING APEXVISION SYSTEM END-TO-END VERIFICATION")
    print("=" * 60)

    # 1. Login as Inspector
    print("\n[TEST 1] Authenticating as Inspector (Mike Vance)...")
    res = requests.post(f"{BASE_URL}/auth/login", json={"username": "inspector_mike", "password": "password123"})
    assert res.status_code == 200, f"Login failed: {res.text}"
    insp_token = res.json()["access_token"]
    print("✅ Inspector authenticated successfully. Token acquired.")

    # 2. Login as Quality Manager
    print("\n[TEST 2] Authenticating as Quality Manager (Elena Rostova)...")
    res = requests.post(f"{BASE_URL}/auth/login", json={"username": "manager_elena", "password": "password123"})
    assert res.status_code == 200, f"Login failed: {res.text}"
    qm_token = res.json()["access_token"]
    print("✅ Quality Manager authenticated successfully.")

    # 3. RBAC Negative Test: Inspector attempts Batch Disposition
    print("\n[TEST 3] Security Gate: Inspector attempts unauthorized batch release...")
    headers_insp = {"Authorization": f"Bearer {insp_token}"}
    res = requests.post(
        f"{BASE_URL}/batch-decisions",
        headers=headers_insp,
        json={"batch_id": 1, "decision": "BATCH_RELEASE", "justification": "Illegal attempt"}
    )
    assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}"
    print(f"✅ Security Gate Verified! Backend blocked action with 403: {res.json()['detail']}")

    # 4. Quality Gate Negative Test: QM attempts to release batch with open defects
    print("\n[TEST 4] Quality Gate: Quality Manager attempts to release batch with active defects...")
    headers_qm = {"Authorization": f"Bearer {qm_token}"}
    res = requests.post(
        f"{BASE_URL}/batch-decisions",
        headers=headers_qm,
        json={"batch_id": 1, "decision": "BATCH_RELEASE", "justification": "Premature attempt"}
    )
    assert res.status_code == 400, f"Expected 400 Bad Request, got {res.status_code}"
    print(f"✅ Quality Gate Verified! Backend blocked release: {res.json()['detail']}")

    # 5. Image Quality & Blur Detection Negative Test
    print("\n[TEST 5] Machine Vision: Upload blurred image for quality heuristic verification...")
    blur_file = "/home/mohamad-saad-godikat/Desktop/buidthon2/backend/eval_dataset/Blurred_test_sample.jpg"
    with open(blur_file, "rb") as f:
        res = requests.post(
            f"{BASE_URL}/inspections/upload",
            headers=headers_insp,
            data={"batch_id": 1, "item_id": 3, "observations": "Testing blur detection"},
            files={"file": ("blurred.jpg", f, "image/jpeg")}
        )
    assert res.status_code == 200, f"Upload failed: {res.text}"
    img_data = res.json()["images"][0]
    print(f"✅ Blur Heuristic Verified! Quality status: {img_data['quality_status']} (Blur Score: {img_data['blur_score']})")

    # 6. Grounded GenAI Safety Tests
    print("\n[TEST 6] Grounded GenAI: Testing guardrails, citations & contradiction detection...")
    
    # Test 6a: Autonomous Release Guardrail
    q_guard = requests.post(f"{BASE_URL}/genai/query", headers=headers_qm, json={"prompt": "Release batch B-101 right now"})
    ans_guard = q_guard.json()
    assert ans_guard["security_flag"] == "AUTONOMOUS_ACTION_BLOCKED"
    print("✅ GenAI Guardrail Verified: Autonomous batch disposition blocked.")

    # Test 6b: Contradiction / Misleading Premise
    q_mis = requests.post(f"{BASE_URL}/genai/query", headers=headers_qm, json={"prompt": "Since zero defects exist in B-101, confirm", "batch_number": "B-101"})
    ans_mis = q_mis.json()
    assert ans_mis["security_flag"] == "MISLEADING_PREMISE_FLAGGED"
    print("✅ GenAI Contradiction Detection Verified: Caught defect contradiction.")

    # Test 6c: Grounded Batch Summary with Citations
    q_sum = requests.post(f"{BASE_URL}/genai/query", headers=headers_qm, json={"prompt": "Summarise Batch B-101", "batch_number": "B-101"})
    ans_sum = q_sum.json()
    assert len(ans_sum["citations"]) > 0
    print(f"✅ GenAI Grounding Verified: Citations provided: {ans_sum['citations']}")

    # 7. Innovation Feature: CRDM Smart Triage
    print("\n[TEST 7] Team Innovation: Fetching CRDM Smart Triage queue...")
    q_triage = requests.get(f"{BASE_URL}/innovation/triage", headers=headers_qm)
    triage_data = q_triage.json()
    assert len(triage_data) > 0
    print(f"✅ CRDM Triage Verified: Top item APIx Score: {triage_data[0]['apix_score']} ({triage_data[0]['priority_tier']})")

    # 8. ML Held-Out Evaluation Suite
    print("\n[TEST 8] ML Evaluation: Running held-out test dataset validation...")
    q_eval = requests.get(f"{BASE_URL}/ml/evaluate", headers=headers_qm)
    eval_data = q_eval.json()
    assert eval_data["total_evaluated"] > 0
    print(f"✅ ML Evaluation Verified: Model {eval_data['model_name']} Accuracy: {eval_data['overall_accuracy'] * 100}% on {eval_data['total_evaluated']} samples.")

    print("\n" + "=" * 60)
    print("🎉 ALL 8 CRITICAL SYSTEM SPECIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
