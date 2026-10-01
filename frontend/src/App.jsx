import React, { useState, useEffect } from 'react';

const ROLES = [
  { role: 'INSPECTOR', name: 'Mike Vance', label: 'Inspector / Operator', title: 'Lead Inspector • Cleanroom 4', username: 'inspector_mike', avatar: '/assets/inspector_portrait.jpg' },
  { role: 'SUPERVISOR', name: 'Sarah Jenkins', label: 'Production Supervisor', title: 'Line Supervisor • Unit Alpha', username: 'supervisor_sarah', avatar: '/assets/inspector_portrait.jpg' },
  { role: 'QUALITY_MANAGER', name: 'Elena Rostova', label: 'Quality Manager (Admin)', title: 'QA Director • Plant Ops', username: 'manager_elena', avatar: '/assets/inspector_portrait.jpg' }
];

export default function App() {
  const [currentUser, setCurrentUser] = useState(ROLES[0]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(false); // Default is Light Mode (White background)
  const [token, setToken] = useState(null);

  // Sync theme with body class
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Data states
  const [dashboard, setDashboard] = useState(null);
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [defects, setDefects] = useState([]);
  const [actions, setActions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [mlEval, setMlEval] = useState(null);
  const [triageQueue, setTriageQueue] = useState([]);
  const [agreementData, setAgreementData] = useState(null);

  // Selected entities & interactive states
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Review Form
  const [reviewForm, setReviewForm] = useState({
    review_status: 'CONFIRMED',
    final_verdict: 'NO_DEFECT',
    human_category: 'Scratch',
    severity: 'MAJOR',
    rationale_notes: ''
  });

  // Batch Decision Form
  const [batchDecisionForm, setBatchDecisionForm] = useState({
    batch_id: '',
    decision: 'BATCH_RELEASE',
    justification: ''
  });

  // Corrective Action Form
  const [correctiveActionUpdate, setCorrectiveActionUpdate] = useState({
    action_id: null,
    work_performed: '',
    status: 'COMPLETED'
  });

  // Reinspection Form
  const [reinspectionForm, setReinspectionForm] = useState({
    corrective_action_id: '',
    defect_id: '',
    outcome: 'PASSED_CLOSED',
    notes: ''
  });

  // GenAI Assistant
  const [genAiPrompt, setGenAiPrompt] = useState('');
  const [genAiResult, setGenAiResult] = useState(null);
  const [genAiLoading, setGenAiLoading] = useState(false);

  // Upload Form
  const [uploadBatchId, setUploadBatchId] = useState('');
  const [batchItems, setBatchItems] = useState([]);
  const [uploadItemId, setUploadItemId] = useState('');
  const [uploadObs, setUploadObs] = useState('');
  const [uploadFile, setUploadFile] = useState(null);

  // New Batch Form
  const [newBatchForm, setNewBatchForm] = useState({
    product_id: '',
    batch_number: '',
    quantity: 100,
    notes: ''
  });

  const showNotify = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // Login handler
  const loginAsRole = async (userObj) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userObj.username, password: 'password123' })
      });
      if (!res.ok) throw new Error('Authentication failed');
      const data = await res.json();
      setToken(data.access_token);
      setCurrentUser(userObj);
      showNotify(`Authenticated as ${userObj.label}`, 'success');
    } catch (err) {
      showNotify(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loginAsRole(ROLES[0]);
  }, []);

  // Refresh data
  const refreshAllData = async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const dashRes = await fetch('/api/dashboard', { headers });
      if (dashRes.ok) setDashboard(await dashRes.json());

      const batchRes = await fetch('/api/batches', { headers });
      if (batchRes.ok) {
        const bData = await batchRes.json();
        setBatches(bData);
        if (bData.length > 0 && !uploadBatchId) setUploadBatchId(bData[0].id);
      }

      const prodRes = await fetch('/api/products', { headers });
      if (prodRes.ok) setProducts(await prodRes.json());

      const inspRes = await fetch('/api/inspections', { headers });
      if (inspRes.ok) {
        const iData = await inspRes.json();
        setInspections(iData);
        if (iData.length > 0 && !selectedInspection) setSelectedInspection(iData[0]);
      }

      const defRes = await fetch('/api/defects', { headers });
      if (defRes.ok) setDefects(await defRes.json());

      const actRes = await fetch('/api/corrective-actions', { headers });
      if (actRes.ok) setActions(await actRes.json());

      const triageRes = await fetch('/api/innovation/triage', { headers });
      if (triageRes.ok) setTriageQueue(await triageRes.json());

      const agreeRes = await fetch('/api/innovation/agreement', { headers });
      if (agreeRes.ok) setAgreementData(await agreeRes.json());

      const evalRes = await fetch('/api/ml/evaluate', { headers });
      if (evalRes.ok) setMlEval(await evalRes.json());

      if (currentUser.role === 'QUALITY_MANAGER') {
        const auditRes = await fetch('/api/audit-logs', { headers });
        if (auditRes.ok) setAuditLogs(await auditRes.json());
      }
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    if (token) refreshAllData();
  }, [token, currentUser]);

  useEffect(() => {
    if (uploadBatchId && token) {
      fetch(`/api/batches/${uploadBatchId}/items`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(items => {
        setBatchItems(items);
        if (items.length > 0) setUploadItemId(items[0].id);
      })
      .catch(console.error);
    }
  }, [uploadBatchId, token]);

  // Inspection Upload
  const handleUploadInspection = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      showNotify('Please attach an inspection image', 'warning');
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append('batch_id', uploadBatchId);
    formData.append('item_id', uploadItemId);
    formData.append('observations', uploadObs);
    formData.append('file', uploadFile);

    try {
      const res = await fetch('/api/inspections/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }
      const newInsp = await res.json();
      showNotify(`Image ingested. AI Model detected: ${newInsp.images[0]?.ml_result?.predicted_class || 'Processed'}`, 'success');
      setSelectedInspection(newInsp);
      setUploadObs('');
      setUploadFile(null);
      refreshAllData();
      setActiveTab('reviews');
    } catch (err) {
      showNotify(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Submit Review
  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!selectedInspection) return;
    if (!reviewForm.rationale_notes.trim()) {
      showNotify('Mandatory engineering verification explanation required.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          inspection_id: selectedInspection.id,
          review_status: reviewForm.review_status,
          final_verdict: reviewForm.final_verdict,
          human_category: reviewForm.human_category,
          severity: reviewForm.severity,
          rationale_notes: reviewForm.rationale_notes
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Review failed');
      }
      showNotify('Human verification saved! Finding recorded separately from raw AI suggestion.', 'success');
      setReviewForm({ ...reviewForm, rationale_notes: '' });
      refreshAllData();
    } catch (err) {
      showNotify(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Create Batch
  const handleCreateBatch = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_id: parseInt(newBatchForm.product_id),
          batch_number: newBatchForm.batch_number,
          quantity: parseInt(newBatchForm.quantity),
          notes: newBatchForm.notes
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Batch creation failed');
      }
      showNotify(`Batch ${newBatchForm.batch_number} initialized with physical item units!`, 'success');
      setNewBatchForm({ product_id: '', batch_number: '', quantity: 100, notes: '' });
      refreshAllData();
    } catch (err) {
      showNotify(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Corrective Action Update
  const handleUpdateAction = async (e) => {
    e.preventDefault();
    if (!correctiveActionUpdate.action_id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/corrective-actions/${correctiveActionUpdate.action_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          work_performed: correctiveActionUpdate.work_performed,
          status: correctiveActionUpdate.status
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Action update failed');
      }
      showNotify('Corrective repair action saved! Ready for reinspection.', 'success');
      setCorrectiveActionUpdate({ action_id: null, work_performed: '', status: 'COMPLETED' });
      refreshAllData();
    } catch (err) {
      showNotify(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Reinspection
  const handleRecordReinspection = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/reinspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          corrective_action_id: parseInt(reinspectionForm.corrective_action_id),
          defect_id: parseInt(reinspectionForm.defect_id),
          outcome: reinspectionForm.outcome,
          notes: reinspectionForm.notes
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Reinspection failed');
      }
      showNotify(`Reinspection outcome recorded: ${reinspectionForm.outcome}`, 'success');
      setReinspectionForm({ corrective_action_id: '', defect_id: '', outcome: 'PASSED_CLOSED', notes: '' });
      refreshAllData();
    } catch (err) {
      showNotify(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Batch Decision
  const handleBatchDecision = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/batch-decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          batch_id: parseInt(batchDecisionForm.batch_id),
          decision: batchDecisionForm.decision,
          justification: batchDecisionForm.justification
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Batch release gate rejected action');
      }
      showNotify(`Authorized disposition recorded: ${batchDecisionForm.decision}`, 'success');
      setBatchDecisionForm({ batch_id: '', decision: 'BATCH_RELEASE', justification: '' });
      refreshAllData();
    } catch (err) {
      showNotify(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // GenAI Query
  const handleGenAiQuery = async (queryText) => {
    const textToQuery = queryText || genAiPrompt;
    if (!textToQuery.trim()) return;
    setGenAiLoading(true);
    try {
      const res = await fetch('/api/genai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: textToQuery })
      });
      const data = await res.json();
      setGenAiResult(data);
    } catch (err) {
      showNotify('GenAI Assistant query failed', 'danger');
    } finally {
      setGenAiLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--workspace-bg)' }}>
      {/* 1. PERSISTENT INDUSTRIAL SIDEBAR (STITCH ARCHITECTURE) */}
      <aside className="stitch-sidebar">
        {/* Brand Header */}
        <div style={{
          height: 56,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-hairline)',
          background: 'var(--surface-dark)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, #0284C7 0%, #38BDF8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#FFFFFF', fontWeight: 'bold' }}>shield</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--on-surface)' }}>ApexVision</span>
          </div>
          <span className="stitch-badge stitch-badge-cyan">v2.4 Enterprise</span>
        </div>

        {/* Sidebar Nav Links */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* PRIMARY */}
          <div>
            <div className="nav-section-title">PRIMARY</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                <span className="material-symbols-outlined">dashboard</span>
                <span>Executive Dashboard</span>
              </button>
              <button className={`sidebar-link ${activeTab === 'batches' ? 'active' : ''}`} onClick={() => setActiveTab('batches')}>
                <span className="material-symbols-outlined">inventory_2</span>
                <span>Products & Batches</span>
              </button>
              <button className={`sidebar-link ${activeTab === 'defects' ? 'active' : ''}`} onClick={() => setActiveTab('defects')}>
                <span className="material-symbols-outlined">flag</span>
                <span>Defect Register</span>
              </button>
            </div>
          </div>

          {/* OPERATIONS */}
          <div>
            <div className="nav-section-title">OPERATIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button className={`sidebar-link ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
                <span className="material-symbols-outlined">input</span>
                <span>Inspection Intake</span>
              </button>
              <button className={`sidebar-link ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
                <span className="material-symbols-outlined">biotech</span>
                <span>Review Station</span>
              </button>
              <button className={`sidebar-link ${activeTab === 'reinspection' ? 'active' : ''}`} onClick={() => setActiveTab('reinspection')}>
                <span className="material-symbols-outlined">replay</span>
                <span>Reinspection</span>
              </button>
              <button className={`sidebar-link ${activeTab === 'batchDecision' ? 'active' : ''}`} onClick={() => setActiveTab('batchDecision')}>
                <span className="material-symbols-outlined">verified</span>
                <span>Batch Release Gate</span>
              </button>
            </div>
          </div>

          {/* INTELLIGENCE */}
          <div>
            <div className="nav-section-title">INTELLIGENCE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button className={`sidebar-link ${activeTab === 'genai' ? 'active' : ''}`} onClick={() => setActiveTab('genai')}>
                <span className="material-symbols-outlined">neurology</span>
                <span>Grounded GenAI Copilot</span>
              </button>
              <button className={`sidebar-link ${activeTab === 'evaluation' ? 'active' : ''}`} onClick={() => setActiveTab('evaluation')}>
                <span className="material-symbols-outlined">analytics</span>
                <span>ML Evaluation Suite</span>
              </button>
              <button className={`sidebar-link ${activeTab === 'innovation' ? 'active' : ''}`} onClick={() => setActiveTab('innovation')}>
                <span className="material-symbols-outlined">auto_awesome</span>
                <span>Smart Triage Innovation</span>
              </button>
            </div>
          </div>

          {/* SYSTEM */}
          <div>
            <div className="nav-section-title">SYSTEM</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {currentUser.role === 'QUALITY_MANAGER' && (
                <button className={`sidebar-link ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
                  <span className="material-symbols-outlined">history_edu</span>
                  <span>Audit Trail</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer Telemetry & User Card */}
        <div style={{
          padding: 12,
          borderTop: '1px solid var(--border-hairline)',
          background: 'var(--surface-dark)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          {/* Node Health */}
          <div style={{
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '1px solid var(--border-hairline)',
            fontSize: 11
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--emerald-accent)' }}></span>
                Edge Node 04
              </span>
              <span style={{ color: 'var(--emerald-accent)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>Operational</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              <span>Uptime: 99.98%</span>
              <span>Latency: 2.4ms</span>
            </div>
          </div>

          {/* User Card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src="/assets/inspector_portrait.jpg"
              alt="User Avatar"
              style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--cyan-neon)', objectCover: 'cover' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentUser.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-mono)' }}>
                {currentUser.title}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE VIEWPORT */}
      <div className="stitch-main" style={{ flex: 1 }}>
        {/* Top Operational Header */}
        <header className="stitch-header">
          {/* Breadcrumb & Terminal ID */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontWeight: 700, color: 'var(--on-surface)' }}>Terminal 04</span>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>chevron_right</span>
            <span style={{ color: 'var(--cyan-bright)', fontWeight: 600 }}>AOI Telemetry</span>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)' }}>chevron_right</span>
            <span className="stitch-badge stitch-badge-emerald">LINE A-ACTIVE</span>
          </div>

          {/* Center Search / Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', width: 240 }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: 7, fontSize: 16, color: 'var(--text-muted)' }}>search</span>
              <input
                style={{ height: 32, paddingLeft: 30, paddingRight: 36, fontSize: 12 }}
                placeholder="Search telemetry, batches..."
              />
              <span style={{ position: 'absolute', right: 6, top: 6, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '1px 4px', background: 'var(--surface-dark)', borderRadius: 2 }}>⌘K</span>
            </div>

            {/* Role Simulation Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-dark)', padding: '2px 4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', paddingLeft: 4, fontWeight: 700 }}>ROLE:</span>
              {ROLES.map(r => (
                <button
                  key={r.role}
                  onClick={() => loginAsRole(r)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: currentUser.role === r.role ? 'var(--surface)' : 'transparent',
                    color: currentUser.role === r.role ? 'var(--cyan-bright)' : 'var(--text-secondary)',
                    boxShadow: currentUser.role === r.role ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                  }}
                >
                  {r.label.split(' ')[0]}
                </button>
              ))}
            </div>

            {/* Theme Toggle Button */}
            <button
              className="stitch-btn stitch-btn-secondary"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title="Toggle Light / Dark Mode"
              style={{ padding: '6px 10px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: isDarkMode ? '#FBBF24' : '#0284C7' }}>
                {isDarkMode ? 'light_mode' : 'dark_mode'}
              </span>
              <span style={{ fontSize: 11 }}>{isDarkMode ? 'Dark' : 'Light'}</span>
            </button>

            {/* Quick Refresh */}
            <button className="stitch-btn stitch-btn-secondary" onClick={refreshAllData} title="Refresh System Telemetry">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
            </button>
          </div>
        </header>

        {/* NOTIFICATION BANNER */}
        {notification && (
          <div style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
            background: notification.type === 'danger' ? 'var(--danger-accent)' : (notification.type === 'success' ? 'var(--emerald-accent)' : 'var(--cyan-neon)'),
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {notification.type === 'success' ? 'check_circle' : 'warning'}
            </span>
            <span>{notification.msg}</span>
          </div>
        )}

        {/* VIEWPORT CONTENT CONTAINER */}
        <div style={{ padding: 24, flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ========================================================= */}
          {/* TAB 1: EXECUTIVE DASHBOARD (LIGHT THEME STITCH)           */}
          {/* ========================================================= */}
          {activeTab === 'dashboard' && dashboard && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Top Action & Terminal Status Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-0.02em' }}>
                      Executive Quality Intelligence
                    </h2>
                    <span className="stitch-badge stitch-badge-cyan">AOI TELEMETRY ACTIVE</span>
                    <span className="stitch-badge" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>STATION 04 • CLEANROOM ALPHA</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                    Real-time optical metrology, automated defect classification, and batch integrity audit stream.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', padding: '5px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: 10 }}>CYCLE SPEED: 1.84s/pc</span>
                    <span style={{ color: 'var(--emerald-accent)', fontWeight: 700 }}>YIELD: 98.4%</span>
                  </div>
                  <button className="stitch-btn stitch-btn-primary" onClick={() => showNotify('Exported ISO-9001 Compliance Quality Report', 'success')}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>file_download</span>
                    <span>Export ISO-9001 Report</span>
                  </button>
                </div>
              </div>

              {/* 5 Top KPI Telemetry Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
                {/* KPI 1: Inspected Items */}
                <div className="stitch-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Inspected Items</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--emerald-accent)' }}>verified</span>
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: 6, color: 'var(--on-surface)' }}>
                    {dashboard.summary.total_inspections} <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>/ {dashboard.summary.total_items}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Physical lot coverage</span>
                    <span className="stitch-badge stitch-badge-cyan">{dashboard.summary.inspection_coverage_pct}%</span>
                  </div>
                  <svg style={{ width: '100%', height: 24, marginTop: 8 }} preserveAspectRatio="none" viewBox="0 0 100 24">
                    <path d="M0,20 L20,18 L40,21 L60,12 L80,14 L100,6" fill="none" stroke="var(--cyan-neon)" strokeWidth="1.75" />
                  </svg>
                </div>

                {/* KPI 2: Pending Reviews */}
                <div className="stitch-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Pending Reviews</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--amber-accent)' }}>pending_actions</span>
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: 6, color: dashboard.summary.pending_reviews > 0 ? 'var(--amber-accent)' : 'var(--emerald-accent)' }}>
                    {dashboard.summary.pending_reviews}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Human verification gate</span>
                    <span className="stitch-badge stitch-badge-amber">Action Needed</span>
                  </div>
                  <svg style={{ width: '100%', height: 24, marginTop: 8 }} preserveAspectRatio="none" viewBox="0 0 100 24">
                    <path d="M0,10 L25,12 L50,8 L75,15 L100,10" fill="none" stroke="var(--amber-accent)" strokeWidth="1.75" />
                  </svg>
                </div>

                {/* KPI 3: Confirmed Defects */}
                <div className="stitch-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Confirmed Defects</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--danger-accent)' }}>warning</span>
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: 6, color: dashboard.summary.confirmed_defects > 0 ? 'var(--danger-accent)' : 'var(--emerald-accent)' }}>
                    {dashboard.summary.confirmed_defects}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Separated from raw AI</span>
                    <span className="stitch-badge stitch-badge-danger">Audited</span>
                  </div>
                  <svg style={{ width: '100%', height: 24, marginTop: 8 }} preserveAspectRatio="none" viewBox="0 0 100 24">
                    <path d="M0,18 L30,16 L60,20 L80,10 L100,12" fill="none" stroke="var(--danger-accent)" strokeWidth="1.75" />
                  </svg>
                </div>

                {/* KPI 4: Open Actions */}
                <div className="stitch-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Corrective Work</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--cyan-bright)' }}>build</span>
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: 6, color: 'var(--on-surface)' }}>
                    {dashboard.summary.open_actions}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Supervisor work orders</span>
                    <span className="stitch-badge stitch-badge-cyan">Active</span>
                  </div>
                  <svg style={{ width: '100%', height: 24, marginTop: 8 }} preserveAspectRatio="none" viewBox="0 0 100 24">
                    <path d="M0,14 L30,10 L60,16 L100,8" fill="none" stroke="var(--cyan-bright)" strokeWidth="1.75" />
                  </svg>
                </div>
              </div>

              {/* Defect Breakdown & Live Telemetry Stream */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
                {/* Defect Distribution */}
                <div className="stitch-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--on-surface)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--danger-accent)' }}>pie_chart</span>
                      Defect Category Distribution (Item-Level)
                    </h3>
                    <span className="stitch-badge stitch-badge-cyan">DENOMINATOR: PHYSICAL ITEMS</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Object.entries(dashboard.defect_distribution).map(([cat, cnt]) => (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{cat}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, maxWidth: 220, marginLeft: 16 }}>
                          <div style={{ flex: 1, height: 8, background: 'var(--surface-dark)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, cnt * 33)}%`, height: '100%', background: 'linear-gradient(90deg, #DC2626, #F87171)' }}></div>
                          </div>
                          <span className="mono-chip">{cnt} items</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Audit Stream */}
                <div className="stitch-card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: 'var(--on-surface)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--cyan-neon)' }}>schedule</span>
                    Live Inspection Audit Stream
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                    {dashboard.recent_activity.map((a, i) => (
                      <div key={i} style={{ padding: 10, background: 'var(--surface-dark)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, color: 'var(--on-surface)' }}>
                            {a.actor} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({a.role})</span>
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{a.time}</span>
                        </div>
                        <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
                          <span className="mono-chip" style={{ marginRight: 6 }}>{a.action}</span>
                          <span>{a.reason}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: REVIEW STATION (LIGHT THEME STITCH)                */}
          {/* ========================================================= */}
          {activeTab === 'reviews' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
              {/* Left Column: Inspection Queue */}
              <div className="stitch-card" style={{ padding: 16, maxHeight: '82vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Inspection Triage ({inspections.length})
                  </h3>
                  <span className="stitch-badge stitch-badge-cyan">STATION 04</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {inspections.map(insp => {
                    const img = insp.images[0];
                    const ml = img?.ml_result;
                    const isSelected = selectedInspection?.id === insp.id;

                    return (
                      <div
                        key={insp.id}
                        onClick={() => setSelectedInspection(insp)}
                        style={{
                          padding: 10,
                          borderRadius: 'var(--radius-md)',
                          background: isSelected ? 'var(--cyan-dim)' : 'var(--surface-dark)',
                          border: isSelected ? '1px solid var(--cyan-neon)' : '1px solid var(--border-hairline)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="mono-chip">INS-{insp.id}</span>
                          <span className={`stitch-badge ${insp.status === 'REVIEWED' ? 'stitch-badge-emerald' : 'stitch-badge-amber'}`}>
                            {insp.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)' }}>
                          {insp.item_code} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({insp.batch_number})</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--cyan-bright)', fontFamily: 'var(--font-mono)' }}>
                          AI: {ml?.predicted_class || 'Processing...'} ({(ml?.confidence_score * 100 || 0).toFixed(0)}%)
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Split Screen Viewfinder & Human Verification */}
              {selectedInspection ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Viewfinder & AI Analysis Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                    {/* Reticle Camera Viewport */}
                    <div className="stitch-card reticle-container" style={{ padding: 16, background: '#0F172A', minHeight: 340, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                      <div className="reticle-corner-tl"></div>
                      <div className="reticle-corner-tr"></div>
                      <div className="reticle-corner-bl"></div>
                      <div className="reticle-corner-br"></div>

                      {/* Real Image Render */}
                      <img
                        src={`/api/images/${selectedInspection.images[0]?.file_path.split('/').pop()}`}
                        alt="Macro Inspection"
                        style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
                        onError={(e) => { e.target.src = '/assets/metallurgical_defect.jpg'; }}
                      />

                      {/* Viewfinder Telemetry Overlay */}
                      <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 12, display: 'flex', gap: 6 }}>
                        <span className="stitch-badge stitch-badge-cyan" style={{ background: 'rgba(0,0,0,0.6)', color: '#38BDF8' }}>MAG: 40X</span>
                        <span className="stitch-badge stitch-badge-emerald" style={{ background: 'rgba(0,0,0,0.6)', color: '#34D399' }}>LIGHT: 4800K</span>
                      </div>

                      <div style={{ position: 'absolute', bottom: 12, left: 16, zIndex: 12, fontSize: 10, fontFamily: 'var(--font-mono)', color: '#38BDF8', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 2 }}>
                        RETICLE: 50.00mm ± 0.05mm
                      </div>
                    </div>

                    {/* AI ML Diagnostics Telemetry Panel */}
                    <div className="stitch-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-hairline)', paddingBottom: 8 }}>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--cyan-bright)', fontWeight: 700 }}>
                          MetalDefectVision-ResNet (v1.2.0)
                        </span>
                        <span className="stitch-badge stitch-badge-cyan">AI INFERENCE</span>
                      </div>

                      {selectedInspection.images[0]?.ml_result ? (
                        <>
                          <div>
                            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>PREDICTED DEFECT CLASS</span>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cyan-neon)', fontFamily: 'var(--font-mono)' }}>
                              {selectedInspection.images[0].ml_result.predicted_class}
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                            <div style={{ padding: 10, background: 'var(--surface-dark)', borderRadius: 'var(--radius-sm)' }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>CONFIDENCE</span>
                              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--on-surface)', fontFamily: 'var(--font-mono)' }}>
                                {(selectedInspection.images[0].ml_result.confidence_score * 100).toFixed(1)}%
                              </div>
                            </div>
                            <div style={{ padding: 10, background: 'var(--surface-dark)', borderRadius: 'var(--radius-sm)' }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ANOMALY INDEX</span>
                              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--danger-accent)', fontFamily: 'var(--font-mono)' }}>
                                {selectedInspection.images[0].ml_result.anomaly_score}
                              </div>
                            </div>
                          </div>

                          {/* Quality Heuristic Check */}
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Laplacian Blur Variance:</span>
                            <span className="mono-chip">{selectedInspection.images[0].blur_score} ({selectedInspection.images[0].quality_status})</span>
                          </div>

                          {/* Dual-Check Discrepancy Alert */}
                          {selectedInspection.images[0].ml_result.anomaly_score > 0.7 && (
                            <div style={{ padding: 10, background: 'var(--danger-dim)', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--danger-accent)' }}>
                              ⚠️ <strong>Dual-Check Discrepancy Gate:</strong> High visual anomaly score ({selectedInspection.images[0].ml_result.anomaly_score}). If approving as "No Defect", engineering explanation is required.
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ color: 'var(--text-muted)' }}>No inference computed yet.</div>
                      )}
                    </div>
                  </div>

                  {/* Human Verification Sign-Off Card */}
                  <div className="stitch-card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--on-surface)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--emerald-accent)' }}>verified_user</span>
                        Human Inspector Verification Gate (§5C Enforced)
                      </h4>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>AI Result ≠ Human-Confirmed Result</span>
                    </div>

                    {selectedInspection.human_review ? (
                      <div style={{ padding: 14, background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.3)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="stitch-badge stitch-badge-emerald">Verified by {selectedInspection.human_review.reviewer_name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{selectedInspection.human_review.reviewed_at}</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>
                          Outcome: {selectedInspection.human_review.final_verdict} ({selectedInspection.human_review.review_status})
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                          Rationale: <em>"{selectedInspection.human_review.rationale_notes}"</em>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitReview} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                          <div>
                            <label>Review Decision</label>
                            <select
                              value={reviewForm.review_status}
                              onChange={(e) => setReviewForm({ ...reviewForm, review_status: e.target.value })}
                            >
                              <option value="CONFIRMED">Confirm AI Suggestion</option>
                              <option value="CORRECTED">Correct AI Suggestion</option>
                              <option value="UNCERTAIN">Uncertain / Disputed</option>
                              <option value="EVIDENCE_REQUESTED">Request More Evidence</option>
                            </select>
                          </div>

                          <div>
                            <label>Final Lot Verdict</label>
                            <select
                              value={reviewForm.final_verdict}
                              onChange={(e) => setReviewForm({ ...reviewForm, final_verdict: e.target.value })}
                            >
                              <option value="NO_DEFECT">No Defect (Nominal Pass)</option>
                              <option value="DEFECT_CONFIRMED">Defect Confirmed (Fail)</option>
                            </select>
                          </div>

                          {reviewForm.final_verdict === 'DEFECT_CONFIRMED' && (
                            <div>
                              <label>Defect Category</label>
                              <select
                                value={reviewForm.human_category}
                                onChange={(e) => setReviewForm({ ...reviewForm, human_category: e.target.value })}
                              >
                                <option value="Scratch">Scratch</option>
                                <option value="Porosity">Porosity</option>
                                <option value="Dent">Dent</option>
                                <option value="Corrosion">Corrosion</option>
                              </select>
                            </div>
                          )}
                        </div>

                        <div>
                          <label>Mandatory Engineering Rationale (§5C)</label>
                          <textarea
                            rows={2}
                            placeholder="State technical justification, tolerance measurements, or reasons for override..."
                            value={reviewForm.rationale_notes}
                            onChange={(e) => setReviewForm({ ...reviewForm, rationale_notes: e.target.value })}
                            required
                          />
                        </div>

                        <button type="submit" className="stitch-btn stitch-btn-success" style={{ padding: '10px 16px' }} disabled={loading}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                          <span>Record Independent Human Verification</span>
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ) : (
                <div className="stitch-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Select an inspection from the queue to review.
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: BATCH RELEASE GATE (LIGHT THEME STITCH)            */}
          {/* ========================================================= */}
          {activeTab === 'batchDecision' && (
            <div style={{ maxWidth: 780, margin: '0 auto', width: '100%' }}>
              <div className="stitch-card" style={{ padding: 28 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-hairline)', paddingBottom: 14, marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--cyan-neon)' }}>verified</span>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)' }}>Batch Release & Quality Disposition Gate</h3>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Section 4 & 5E: Independent lot hold/release decision</p>
                    </div>
                  </div>
                  <span className="stitch-badge stitch-badge-amber">QM AUTHORIZED ONLY</span>
                </div>

                {currentUser.role !== 'QUALITY_MANAGER' ? (
                  <div style={{ padding: 20, background: 'var(--danger-dim)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--danger-accent)' }}>lock</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger-accent)', marginTop: 8 }}>
                      Authorization Gate: Access Restricted
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      Current user is <strong>{currentUser.label}</strong>. Problem Statement 01 restricts batch release decisions exclusively to <strong>Quality Managers</strong>. Please switch role to <strong>Elena Rostova (Quality Manager)</strong> using the top bar.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleBatchDecision} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label>Select Production Lot to Evaluate</label>
                      <select
                        value={batchDecisionForm.batch_id}
                        onChange={(e) => setBatchDecisionForm({ ...batchDecisionForm, batch_id: e.target.value })}
                        required
                      >
                        <option value="">Select Batch...</option>
                        {batches.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.batch_number} ({b.status}) — Inspected: {b.inspected_count}, Defects: {b.defect_count}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label>Formal Lot Disposition</label>
                      <select
                        value={batchDecisionForm.decision}
                        onChange={(e) => setBatchDecisionForm({ ...batchDecisionForm, decision: e.target.value })}
                      >
                        <option value="BATCH_RELEASE">BATCH RELEASE (Certify & Release to Inventory)</option>
                        <option value="BATCH_HOLD">BATCH HOLD (Quarantine for Detailed Review)</option>
                        <option value="BATCH_REJECT">BATCH REJECT (Scrap Lot)</option>
                      </select>
                    </div>

                    <div>
                      <label>Engineering Justification & Pre-Flight Release Sign-Off</label>
                      <textarea
                        rows={3}
                        placeholder="State technical justification, sampling coverage verification, and quality audit findings..."
                        value={batchDecisionForm.justification}
                        onChange={(e) => setBatchDecisionForm({ ...batchDecisionForm, justification: e.target.value })}
                        required
                      />
                    </div>

                    <div style={{ padding: 10, background: 'var(--surface-dark)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-muted)' }}>
                      ℹ️ <strong>Backend Enforcement:</strong> If you select `BATCH RELEASE`, the API verifies that all defect tickets are resolved and closed. If active defects remain, the request is rejected with a 400 error.
                    </div>

                    <button type="submit" className="stitch-btn stitch-btn-primary" style={{ padding: '12px' }} disabled={loading}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                      <span>Execute Quality Manager Batch Disposition</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: PRODUCTS & BATCHES INVENTORY                       */}
          {/* ========================================================= */}
          {activeTab === 'batches' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {(currentUser.role === 'SUPERVISOR' || currentUser.role === 'QUALITY_MANAGER') && (
                <div className="stitch-card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--on-surface)' }}>Register Production Batch</h3>
                  <form onSubmit={handleCreateBatch} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, alignItems: 'end' }}>
                    <div>
                      <label>Target Product</label>
                      <select
                        value={newBatchForm.product_id}
                        onChange={(e) => setNewBatchForm({ ...newBatchForm, product_id: e.target.value })}
                        required
                      >
                        <option value="">Select...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.product_code})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Batch Code</label>
                      <input
                        placeholder="e.g. B-105"
                        value={newBatchForm.batch_number}
                        onChange={(e) => setNewBatchForm({ ...newBatchForm, batch_number: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label>Target Quantity</label>
                      <input
                        type="number"
                        value={newBatchForm.quantity}
                        onChange={(e) => setNewBatchForm({ ...newBatchForm, quantity: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <button type="submit" className="stitch-btn stitch-btn-primary" style={{ width: '100%', height: 38 }} disabled={loading}>
                        Create Batch & Physical Items
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="stitch-card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--on-surface)' }}>Active Batch Inventory</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        <th style={{ padding: 10 }}>BATCH ID</th>
                        <th style={{ padding: 10 }}>PRODUCT FAMILY</th>
                        <th style={{ padding: 10 }}>QUANTITY</th>
                        <th style={{ padding: 10 }}>INSPECTED</th>
                        <th style={{ padding: 10 }}>DEFECTS</th>
                        <th style={{ padding: 10 }}>STATUS</th>
                        <th style={{ padding: 10 }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map(b => (
                        <tr key={b.id} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                          <td style={{ padding: 10 }}><span className="mono-chip">{b.batch_number}</span></td>
                          <td style={{ padding: 10 }}>{b.product_name} <br/><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.product_code}</span></td>
                          <td style={{ padding: 10 }}>{b.quantity} pcs</td>
                          <td style={{ padding: 10 }}>{b.inspected_count} items</td>
                          <td style={{ padding: 10 }}>
                            {b.defect_count > 0 ? (
                              <span className="stitch-badge stitch-badge-danger">{b.defect_count} Defects</span>
                            ) : (
                              <span className="stitch-badge stitch-badge-emerald">0 Defects</span>
                            )}
                          </td>
                          <td style={{ padding: 10 }}>
                            <span className={`stitch-badge ${b.status === 'RELEASED' ? 'stitch-badge-emerald' : (b.status === 'ON_HOLD' ? 'stitch-badge-danger' : 'stitch-badge-amber')}`}>
                              {b.status}
                            </span>
                          </td>
                          <td style={{ padding: 10 }}>
                            <button
                              className="stitch-btn stitch-btn-secondary"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => { setUploadBatchId(b.id); setActiveTab('upload'); }}
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: INSPECTION INTAKE                                  */}
          {/* ========================================================= */}
          {activeTab === 'upload' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
              <div className="stitch-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--on-surface)' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--cyan-neon)' }}>upload_file</span>
                  Optical Evidence Ingestion
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
                  Upload item photographs for automated CV inference and Laplacian blur quality screening.
                </p>

                <form onSubmit={handleUploadInspection} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label>Batch</label>
                    <select value={uploadBatchId} onChange={(e) => setUploadBatchId(e.target.value)} required>
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>{b.batch_number} — {b.product_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Physical Item Unit</label>
                    <select value={uploadItemId} onChange={(e) => setUploadItemId(e.target.value)} required>
                      {batchItems.map(item => (
                        <option key={item.id} value={item.id}>{item.item_code} ({item.sample_type}) — Status: {item.status}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Observation Notes</label>
                    <textarea
                      rows={2}
                      placeholder="Specify surface angle or lighting condition..."
                      value={uploadObs}
                      onChange={(e) => setUploadObs(e.target.value)}
                    />
                  </div>

                  <div>
                    <label>Optical Capture Image (.jpg, .png)</label>
                    <input type="file" accept="image/*" onChange={(e) => setUploadFile(e.target.files[0])} required />
                  </div>

                  <button type="submit" className="stitch-btn stitch-btn-primary" style={{ padding: 12 }} disabled={loading}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>biotech</span>
                    <span>{loading ? 'Processing Vision Model...' : 'Upload & Trigger Vision Inference'}</span>
                  </button>
                </form>
              </div>

              {/* Sample Library */}
              <div className="stitch-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--on-surface)' }}>
                  Test Image Library (Calibrated Cases)
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                  Click to inspect sample defect images from the held-out evaluation dataset:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {[
                    { name: 'Scratch Flange', path: '/assets/metallurgical_defect.jpg', desc: 'Score mark across sealing face' },
                    { name: 'Turbine Nominal', path: '/assets/turbine_flange.jpg', desc: 'Machined aerospace pass' },
                    { name: 'Porosity Sample', path: '/assets/metallurgical_defect.jpg', desc: 'Casting void clusters' },
                    { name: 'Corrosion Sample', path: '/assets/metallurgical_defect.jpg', desc: 'Oxidation tint shift' }
                  ].map((s, i) => (
                    <div key={i} style={{ padding: 10, background: 'var(--surface-dark)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)' }}>
                      <img src={s.path} alt={s.name} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: 'var(--on-surface)' }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 6: DEFECT REGISTER & ACTIONS                          */}
          {/* ========================================================= */}
          {activeTab === 'defects' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="stitch-card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: 'var(--on-surface)' }}>
                  Audited Defect Tickets ({defects.length})
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                  {defects.map(d => (
                    <div key={d.id} style={{ padding: 14, background: 'var(--surface-dark)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="mono-chip">{d.defect_code}</span>
                        <span className={`stitch-badge ${d.status === 'CLOSED' ? 'stitch-badge-emerald' : 'stitch-badge-danger'}`}>
                          {d.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger-accent)' }}>
                        {d.defect_category} ({d.severity})
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Batch: {d.batch_number} | Item: {d.item_code}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {d.description}
                      </p>
                      <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: 8, marginTop: 'auto', display: 'flex', gap: 8 }}>
                        {(currentUser.role === 'SUPERVISOR' || currentUser.role === 'QUALITY_MANAGER') && (
                          <button
                            className="stitch-btn stitch-btn-secondary"
                            style={{ flex: 1, fontSize: 11 }}
                            onClick={() => {
                              const act = actions.find(a => a.defect_id === d.id);
                              if (act) setCorrectiveActionUpdate({ action_id: act.id, work_performed: act.work_performed || '', status: act.status });
                            }}
                          >
                            Update Work
                          </button>
                        )}
                        <button
                          className="stitch-btn stitch-btn-secondary"
                          style={{ flex: 1, fontSize: 11 }}
                          onClick={() => {
                            const act = actions.find(a => a.defect_id === d.id);
                            if (act) {
                              setReinspectionForm({ ...reinspectionForm, corrective_action_id: act.id, defect_id: d.id });
                              setActiveTab('reinspection');
                            }
                          }}
                        >
                          Reinspect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {correctiveActionUpdate.action_id && (
                <div className="stitch-card" style={{ padding: 20, border: '1px solid var(--cyan-neon)' }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--on-surface)' }}>
                    Record Supervisor Physical Repair Work (Action #{correctiveActionUpdate.action_id})
                  </h4>
                  <form onSubmit={handleUpdateAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label>Work Performed Notes</label>
                      <textarea
                        rows={2}
                        placeholder="Document lathe re-facing, polishing grit, Ra roughness verification..."
                        value={correctiveActionUpdate.work_performed}
                        onChange={(e) => setCorrectiveActionUpdate({ ...correctiveActionUpdate, work_performed: e.target.value })}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ width: 220 }}>
                        <label>Status</label>
                        <select
                          value={correctiveActionUpdate.status}
                          onChange={(e) => setCorrectiveActionUpdate({ ...correctiveActionUpdate, status: e.target.value })}
                        >
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Completed (Ready for Reinspection)</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
                        <button type="submit" className="stitch-btn stitch-btn-primary">Save Work Order</button>
                        <button type="button" className="stitch-btn stitch-btn-secondary" onClick={() => setCorrectiveActionUpdate({ action_id: null, work_performed: '', status: 'COMPLETED' })}>Cancel</button>
                      </div>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 7: REINSPECTION                                       */}
          {/* ========================================================= */}
          {activeTab === 'reinspection' && (
            <div style={{ maxWidth: 700, margin: '0 auto', width: '100%' }}>
              <div className="stitch-card" style={{ padding: 28 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--on-surface)' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--emerald-accent)' }}>replay</span>
                  Physical Reinspection Verification Gate
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
                  Defects can be closed only through follow-up physical reinspection. Earlier findings remain permanently preserved.
                </p>

                <form onSubmit={handleRecordReinspection} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label>Select Defect to Reinspect</label>
                    <select
                      value={reinspectionForm.defect_id}
                      onChange={(e) => {
                        const defId = parseInt(e.target.value);
                        const act = actions.find(a => a.defect_id === defId);
                        setReinspectionForm({
                          ...reinspectionForm,
                          defect_id: defId,
                          corrective_action_id: act ? act.id : ''
                        });
                      }}
                      required
                    >
                      <option value="">Select Defect Ticket...</option>
                      {defects.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.defect_code}: {d.defect_category} ({d.batch_number} - {d.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Reinspection Outcome</label>
                    <select
                      value={reinspectionForm.outcome}
                      onChange={(e) => setReinspectionForm({ ...reinspectionForm, outcome: e.target.value })}
                    >
                      <option value="PASSED_CLOSED">Passed (Close Defect Ticket)</option>
                      <option value="FAILED_REOPENED">Failed (Reopen Defect Ticket for Further Rework)</option>
                    </select>
                  </div>

                  <div>
                    <label>Reinspection Technical Findings & Evidence Notes</label>
                    <textarea
                      rows={3}
                      placeholder="Document physical measurements, visual roughness check, or re-lap verification..."
                      value={reinspectionForm.notes}
                      onChange={(e) => setReinspectionForm({ ...reinspectionForm, notes: e.target.value })}
                      required
                    />
                  </div>

                  <button type="submit" className="stitch-btn stitch-btn-success" style={{ padding: 12 }} disabled={loading}>
                    <span>Record Reinspection & Update Status</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 8: GROUNDED GENAI COPILOT                             */}
          {/* ========================================================= */}
          {activeTab === 'genai' && (
            <div style={{ maxWidth: 880, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="stitch-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--cyan-neon)' }}>neurology</span>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--on-surface)' }}>Grounded GenAI Quality Copilot</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Strictly grounded in verified DB records (§10 & §11). Cites IDs and blocks autonomous batch releases.
                    </p>
                  </div>
                </div>

                {/* Prompt Shortcuts */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                  {[
                    'Summarise Batch B-101',
                    'What needs attention today?',
                    'Have we seen recurring scratch defects?',
                    'Release batch B-101 right now (Safety Guardrail Test)',
                    'Since zero defects exist in B-101, confirm (Contradiction Test)',
                    'Summarise Batch B-999 (Unknown Batch Test)'
                  ].map((q, idx) => (
                    <button
                      key={idx}
                      className="stitch-btn stitch-btn-secondary"
                      style={{ fontSize: 11, padding: '5px 10px' }}
                      onClick={() => { setGenAiPrompt(q); handleGenAiQuery(q); }}
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <input
                    placeholder="Ask grounded questions about inspection records, defects, or batch lineage..."
                    value={genAiPrompt}
                    onChange={(e) => setGenAiPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGenAiQuery(); }}
                  />
                  <button className="stitch-btn stitch-btn-primary" onClick={() => handleGenAiQuery()} disabled={genAiLoading} style={{ minWidth: 100 }}>
                    {genAiLoading ? 'Querying...' : 'Ask Copilot'}
                  </button>
                </div>
              </div>

              {genAiResult && (
                <div className="stitch-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-hairline)', paddingBottom: 8, marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span className="stitch-badge stitch-badge-cyan">Tool: {genAiResult.tool_executed || 'direct'}</span>
                      {genAiResult.security_flag && (
                        <span className="stitch-badge stitch-badge-danger">Guardrail: {genAiResult.security_flag}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Verified DB Grounding</span>
                  </div>

                  <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--on-surface)' }}>
                    {genAiResult.grounded_answer}
                  </div>

                  {genAiResult.citations?.length > 0 && (
                    <div style={{ marginTop: 14, borderTop: '1px solid var(--border-hairline)', paddingTop: 10 }}>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Grounding Citations:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {genAiResult.citations.map((c, i) => (
                          <span key={i} className="mono-chip">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 9: INNOVATION (CRDM)                                  */}
          {/* ========================================================= */}
          {activeTab === 'innovation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="stitch-card" style={{ padding: 20, border: '1px solid var(--cyan-neon)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--cyan-neon)' }}>auto_awesome</span>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--on-surface)' }}>Confidence-Risk Discrepancy Matrix (CRDM) & Smart Triage</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Addresses Operator Automation Bias through algorithmic Audit Priority Index (APIx) triage and real-time agreement tracking.
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
                {/* Triage Priority Queue */}
                <div className="stitch-card" style={{ padding: 18 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
                    APIx Smart Triage Queue
                  </h4>
                  {triageQueue.map((item, idx) => (
                    <div key={idx} style={{ padding: 10, background: 'var(--surface-dark)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span className="mono-chip">INS-{item.inspection_id}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>{item.item_code}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          AI: {item.predicted_class} | Anomaly: {item.anomaly_score}
                        </div>
                      </div>
                      <span className={`stitch-badge ${item.priority_tier === 'CRITICAL' ? 'stitch-badge-danger' : 'stitch-badge-cyan'}`}>
                        APIx: {item.apix_score} ({item.priority_tier})
                      </span>
                    </div>
                  ))}
                </div>

                {/* Agreement Analytics */}
                <div className="stitch-card" style={{ padding: 18 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Operator vs AI Agreement Analytics
                  </h4>
                  {agreementData && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                        <div style={{ padding: 12, background: 'var(--surface-dark)', borderRadius: 'var(--radius-sm)' }}>
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>OVERALL AGREEMENT</span>
                          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cyan-bright)', fontFamily: 'var(--font-mono)' }}>
                            {agreementData.overall_agreement_rate}%
                          </div>
                        </div>
                        <div style={{ padding: 12, background: 'var(--surface-dark)', borderRadius: 'var(--radius-sm)' }}>
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>DUAL-CHECK DISCREPANCIES</span>
                          <div style={{ fontSize: 22, fontWeight: 800, color: agreementData.dual_check_discrepancies > 0 ? 'var(--danger-accent)' : 'var(--emerald-accent)', fontFamily: 'var(--font-mono)' }}>
                            {agreementData.dual_check_discrepancies}
                          </div>
                        </div>
                      </div>

                      {agreementData.inspector_breakdown.map((insp, i) => (
                        <div key={i} style={{ padding: 8, background: 'var(--surface-dark)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)' }}>{insp.inspector_name}</span>
                          <span className="stitch-badge stitch-badge-emerald">{insp.agreement_pct}% Agreement</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 10: ML EVALUATION SUITE                               */}
          {/* ========================================================= */}
          {activeTab === 'evaluation' && mlEval && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="stitch-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--on-surface)' }}>Held-Out Validation Suite: {mlEval.model_name}</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{mlEval.data_split} | Model Version: {mlEval.model_version}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--emerald-accent)', fontFamily: 'var(--font-mono)' }}>
                      {(mlEval.overall_accuracy * 100).toFixed(1)}%
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Overall Accuracy (16 Samples)</span>
                  </div>
                </div>
              </div>

              {/* Confusion Matrix Table */}
              <div className="stitch-card" style={{ padding: 20 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 14 }}>
                  Held-Out Confusion Matrix
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        <th style={{ padding: 8, textAlign: 'left' }}>TRUE \ PRED</th>
                        {Object.keys(mlEval.confusion_matrix).map(c => (
                          <th key={c} style={{ padding: 8 }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(mlEval.confusion_matrix).map(([trueC, preds]) => (
                        <tr key={trueC} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                          <td style={{ padding: 8, textAlign: 'left', fontWeight: 600, color: 'var(--on-surface)' }}>{trueC}</td>
                          {Object.entries(preds).map(([predC, count]) => {
                            const isDiag = trueC === predC;
                            return (
                              <td key={predC} style={{
                                padding: 8,
                                background: isDiag && count > 0 ? 'rgba(5, 150, 105, 0.12)' : 'transparent',
                                color: isDiag && count > 0 ? 'var(--emerald-accent)' : 'var(--text-secondary)',
                                fontWeight: isDiag ? 700 : 400,
                                fontFamily: 'var(--font-mono)'
                              }}>
                                {count}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 11: AUDIT TRAIL                                       */}
          {/* ========================================================= */}
          {activeTab === 'audit' && currentUser.role === 'QUALITY_MANAGER' && (
            <div className="stitch-card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, color: 'var(--on-surface)' }}>
                Immutable System Audit Trail
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'left' }}>
                      <th style={{ padding: 8 }}>TIMESTAMP</th>
                      <th style={{ padding: 8 }}>ACTOR</th>
                      <th style={{ padding: 8 }}>ACTION</th>
                      <th style={{ padding: 8 }}>ENTITY</th>
                      <th style={{ padding: 8 }}>AUDIT NOTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                        <td style={{ padding: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 11 }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td style={{ padding: 8 }}>
                          <strong style={{ color: 'var(--on-surface)' }}>{log.actor_name}</strong> <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({log.actor_role})</span>
                        </td>
                        <td style={{ padding: 8 }}><span className="mono-chip">{log.action_type}</span></td>
                        <td style={{ padding: 8, color: 'var(--on-surface)' }}>{log.entity_name} ({log.entity_id})</td>
                        <td style={{ padding: 8, color: 'var(--text-secondary)' }}>{log.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
