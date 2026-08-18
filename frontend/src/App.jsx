import { useEffect, useRef, useState } from 'react';

const API_URL = 'http://localhost:5000';

const STANDARD_LEAVE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Casual Leave',
  'Emergency Leave',
  'Maternity / Paternity Leave',
  'Unpaid Leave',
];

const EMERGENCY_LEAVE_TYPE = 'Emergency Leave';
const ROLES = ['Employee', 'Manager', 'Senior Manager', 'Director', 'Vice President'];
const EMPLOYMENT_TYPES = ['Full-Time', 'Part-Time'];

const ROLE_RANKS = {
  'Employee': 1,
  'Manager': 2,
  'Senior Manager': 3,
  'Director': 4,
  'Vice President': 5,
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// =========================================================================
// 1. CALENDAR COMPONENTS
// =========================================================================

function TeamCalendar({ teamData, holidays, onSelectLeave }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const teamLeaves = teamData?.teamLeaves || [];
  const rawAlertDates = teamData?.rawAlertDates || [];
  const alertDateSet = new Set(rawAlertDates.map(a => a.date));

  const dateLeaveMap = {};
  for (const l of teamLeaves) {
    let cur = new Date(l.startDate);
    const end = new Date(l.endDate);
    while (cur <= end) {
      const iso = cur.toISOString().split('T')[0];
      if (!dateLeaveMap[iso]) dateLeaveMap[iso] = [];
      dateLeaveMap[iso].push(l);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const holidayMap = {};
  for (const h of holidays) {
    const iso = h.holidayDate?.split('T')[0];
    if (iso) holidayMap[iso] = h.name;
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  return (
    <div className="cal-wrapper">
      <div className="cal-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={prevMonth}>← Prev</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}>Today</button>
          <button className="btn btn-secondary btn-sm" onClick={nextMonth}>Next →</button>
        </div>
        <span className="cal-nav-title">{MONTHS[viewMonth]} {viewYear}</span>
      </div>

      <div className="cal-grid">
        {DAYS.map(d => <div key={d} className="cal-day-header">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="cal-cell cal-cell-empty" />;
          const mm = String(viewMonth + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const iso = `${viewYear}-${mm}-${dd}`;
          const dayLeaves = dateLeaveMap[iso] || [];
          const holidayName = holidayMap[iso];
          const hasAlert = alertDateSet.has(iso);
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

          return (
            <div
              key={iso}
              className={`cal-cell ${isToday ? 'cal-cell-today' : ''}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="cal-day-num">{day}</span>
                {hasAlert && <span className="badge badge-rejected" style={{ fontSize: '9px', padding: '0 4px' }}>50%+ Alert</span>}
              </div>

              {holidayName && (
                <div className="cal-holiday-tag" title={holidayName}>
                  <span>🎉 {holidayName}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                {dayLeaves.map((l, idx) => (
                  <div
                    key={`${l.id}-${idx}`}
                    className={`cal-member-leave-tag ${l.status === 'PENDING' ? 'pending-leave-tag' : ''} ${l.leaveType === 'Emergency Leave' ? 'emergency-leave-tag' : ''}`}
                    onClick={() => onSelectLeave && onSelectLeave(l)}
                    title={`${l.userName} (${l.userRole}) • ${l.leaveType} • ${l.status}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <span>{l.userName.split(' ')[0]}</span>
                    <span style={{ opacity: 0.8, fontSize: '9px', marginLeft: '3px' }}>
                      {l.leaveType === 'Emergency Leave' ? '🚨' : l.status === 'PENDING' ? '⏳' : '✓'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HolidayCalendar({ holidays, isAdmin, filterRegion, onDelete }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const holidayMap = {};
  for (const h of holidays) {
    const iso = h.holidayDate?.split('T')[0];
    if (iso) {
      if (!holidayMap[iso]) holidayMap[iso] = [];
      holidayMap[iso].push(h);
    }
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  return (
    <div className="cal-wrapper">
      <div className="cal-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={prevMonth}>← Prev</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}>Today</button>
          <button className="btn btn-secondary btn-sm" onClick={nextMonth}>Next →</button>
        </div>
        <span className="cal-nav-title">{MONTHS[viewMonth]} {viewYear}</span>
      </div>

      <div className="cal-grid">
        {DAYS.map(d => <div key={d} className="cal-day-header">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="cal-cell cal-cell-empty" />;
          const mm = String(viewMonth + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const iso = `${viewYear}-${mm}-${dd}`;
          const dayHolidays = holidayMap[iso] || [];
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

          return (
            <div key={iso} className={`cal-cell ${isToday ? 'cal-cell-today' : ''}`}>
              <span className="cal-day-num">{day}</span>
              {dayHolidays.map((h, idx) => (
                <div key={idx} className="cal-holiday-tag">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                  {isAdmin && (
                    <button className="cal-delete-btn" title="Delete" onClick={() => onDelete(h.id)}>×</button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================================
// 2. COMMAND / PERSONA SELECTOR MODAL
// =========================================================================

function CommandPersonaModal({ users, selectedUserId, onSelect, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = users.filter(u => {
    const q = searchTerm.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q));
  });

  const admins = filtered.filter(u => u.isAdmin);
  const directors = filtered.filter(u => !u.isAdmin && (u.role === 'Director' || u.role === 'Vice President'));
  const seniorManagers = filtered.filter(u => !u.isAdmin && u.role === 'Senior Manager');
  const managers = filtered.filter(u => !u.isAdmin && u.role === 'Manager');
  const employees = filtered.filter(u => !u.isAdmin && u.role === 'Employee');

  return (
    <div className="command-modal-overlay" onClick={onClose}>
      <div className="command-modal" onClick={e => e.stopPropagation()}>
        <div className="command-search-wrap">
          <span style={{ color: 'var(--text-tertiary)' }}>🔍</span>
          <input
            type="text"
            className="command-search-input"
            placeholder="Switch simulated user persona (search by name, role, email)..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>

        <div className="command-list">
          {admins.length > 0 && (
            <div>
              <div className="command-group-label">System Administration</div>
              {admins.map(u => (
                <div
                  key={u.id}
                  className={`command-item ${u.id.toString() === selectedUserId ? 'selected' : ''}`}
                  onClick={() => { onSelect(u.id.toString()); onClose(); }}
                >
                  <div className="command-item-main">
                    <div className="user-avatar avatar-admin">⚙️</div>
                    <div className="command-item-text">
                      <span className="command-item-name">{u.name}</span>
                      <span className="command-item-meta">Full Corporate Admin Console</span>
                    </div>
                  </div>
                  <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>Admin</span>
                </div>
              ))}
            </div>
          )}

          {directors.length > 0 && (
            <div>
              <div className="command-group-label">Directors & Executives</div>
              {directors.map(u => (
                <div
                  key={u.id}
                  className={`command-item ${u.id.toString() === selectedUserId ? 'selected' : ''}`}
                  onClick={() => { onSelect(u.id.toString()); onClose(); }}
                >
                  <div className="command-item-main">
                    <div className="user-avatar avatar-exec">👑</div>
                    <div className="command-item-text">
                      <span className="command-item-name">{u.name}</span>
                      <span className="command-item-meta">{u.role} • Region {u.region}</span>
                    </div>
                  </div>
                  <span className="badge badge-approved">Org Scope</span>
                </div>
              ))}
            </div>
          )}

          {seniorManagers.length > 0 && (
            <div>
              <div className="command-group-label">Senior Managers</div>
              {seniorManagers.map(u => (
                <div
                  key={u.id}
                  className={`command-item ${u.id.toString() === selectedUserId ? 'selected' : ''}`}
                  onClick={() => { onSelect(u.id.toString()); onClose(); }}
                >
                  <div className="command-item-main">
                    <div className="user-avatar">🔷</div>
                    <div className="command-item-text">
                      <span className="command-item-name">{u.name}</span>
                      <span className="command-item-meta">{u.role} (Reports to {u.managerName || 'Director'})</span>
                    </div>
                  </div>
                  <span className="badge badge-approved">Team Scope</span>
                </div>
              ))}
            </div>
          )}

          {managers.length > 0 && (
            <div>
              <div className="command-group-label">Managers</div>
              {managers.map(u => (
                <div
                  key={u.id}
                  className={`command-item ${u.id.toString() === selectedUserId ? 'selected' : ''}`}
                  onClick={() => { onSelect(u.id.toString()); onClose(); }}
                >
                  <div className="command-item-main">
                    <div className="user-avatar">🔶</div>
                    <div className="command-item-text">
                      <span className="command-item-name">{u.name}</span>
                      <span className="command-item-meta">{u.role} (Reports to {u.managerName || 'Sr. Manager'})</span>
                    </div>
                  </div>
                  <span className="badge badge-approved">Direct Team</span>
                </div>
              ))}
            </div>
          )}

          {employees.length > 0 && (
            <div>
              <div className="command-group-label">Employees</div>
              {employees.map(u => (
                <div
                  key={u.id}
                  className={`command-item ${u.id.toString() === selectedUserId ? 'selected' : ''}`}
                  onClick={() => { onSelect(u.id.toString()); onClose(); }}
                >
                  <div className="command-item-main">
                    <div className="user-avatar">👤</div>
                    <div className="command-item-text">
                      <span className="command-item-name">{u.name}</span>
                      <span className="command-item-meta">{u.role} (Reports to {u.managerName || 'Manager'})</span>
                    </div>
                  </div>
                  <span className="badge badge-withdrawn">Individual</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 3. RAG HR POLICY COPILOT DRAWER
// =========================================================================

function PolicyCopilotDrawer({ onClose }) {
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: 'Hello! I am your AI HR Policy Copilot. Ask me anything about corporate leave policies, maternity benefits, medical certificate rules, carry-forward quotas, or approval tiers.',
      citations: ['Section 1 to 9 Corporate Handbook']
    }
  ]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const SUGGESTED_PROMPTS = [
    'How many weeks of maternity leave do I get?',
    'Do I need a doctor certificate for 3 days of sick leave?',
    'Can I carry forward unused annual leaves to next year?',
    'What is the paternity leave duration and eligibility?',
    'What is the 12-hour leave withdrawal rule?'
  ];

  const handleAsk = async (textToSend) => {
    const q = (textToSend || query).trim();
    if (!q) return;

    setMessages(prev => [...prev, { sender: 'user', text: q }]);
    setQuery('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/rag/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
      if (!res.ok) throw new Error('Failed to query policy copilot');
      const data = await res.json();
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: data.answer,
        citations: data.citations
      }]);
    } catch {
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: 'Sorry, I encountered an issue retrieving policy information. Please contact HR.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" style={{ width: '520px' }} onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="drawer-title">🤖 AI HR Policy Copilot</span>
            <span className="badge badge-approved" style={{ fontSize: '10px' }}>RAG Engine</span>
          </div>
          <button className="drawer-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="chat-container">
          <div className="chat-messages-area">
            {messages.map((m, idx) => (
              <div key={idx} className={`chat-bubble ${m.sender}`}>
                <div className="chat-bubble-text">{m.text}</div>
                {m.citations && m.citations.length > 0 && (
                  <div className="chat-citation-box">
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', width: '100%' }}>Verified Citations:</span>
                    {m.citations.map((c, i) => (
                      <span key={i} className="citation-tag">📜 {c}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="chat-bubble bot">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                  <span>🔍 Retrieving policy knowledge chunks...</span>
                </div>
              </div>
            )}

            {/* Quick suggested prompt pills */}
            {messages.length <= 2 && (
              <div className="chat-prompt-pills-row">
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Suggested Questions:</span>
                {SUGGESTED_PROMPTS.map((p, idx) => (
                  <button key={idx} className="chat-prompt-pill" onClick={() => handleAsk(p)}>
                    💬 {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleAsk(); }} className="chat-input-container">
            <input
              type="text"
              className="form-input-text"
              placeholder="Ask a policy question (e.g. maternity weeks, doctor note rules)..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={loading || !query.trim()}>
              Ask AI
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 4. RIGHT-SIDE INSPECTION DRAWER
// =========================================================================

function LeaveDetailDrawer({ leave, activeUser, onClose, onApprove, onReject, onWithdraw, onDownloadReport }) {
  if (!leave) return null;

  const isPending = ['PENDING', 'PENDING_TIER1', 'PENDING_TIER2'].includes(leave.status);
  const isRequester = activeUser && (activeUser.id === leave.userId || activeUser.id === leave.user_id);
  const isApprover = activeUser && (activeUser.id === leave.approverId || activeUser.id === leave.approver_id);

  const history = Array.isArray(leave.approvalHistory) ? leave.approvalHistory : (Array.isArray(leave.approval_history) ? leave.approval_history : []);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="drawer-title">Leave Request #{leave.id}</span>
            <span className={`badge badge-${leave.status.toLowerCase()}`}>{leave.status}</span>
          </div>
          <button className="drawer-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="drawer-body">
          {/* Core Fields */}
          <div className="drawer-section">
            <span className="drawer-section-title">Request Summary</span>
            <div className="drawer-field-grid">
              <div className="drawer-field-item">
                <span className="drawer-field-label">Employee</span>
                <span className="drawer-field-value">{leave.requesterName || leave.userName || activeUser?.name}</span>
              </div>
              <div className="drawer-field-item">
                <span className="drawer-field-label">Leave Type</span>
                <span className="drawer-field-value">{leave.leaveType || leave.leave_type}</span>
              </div>
              <div className="drawer-field-item">
                <span className="drawer-field-label">Duration</span>
                <span className="drawer-field-value">{leave.workingDays || leave.working_days} working days</span>
              </div>
              <div className="drawer-field-item">
                <span className="drawer-field-label">Dates</span>
                <span className="drawer-field-value">{leave.startDate || leave.start_date} → {leave.endDate || leave.end_date}</span>
              </div>
            </div>
          </div>

          {/* Reason / Notes */}
          <div className="drawer-section">
            <span className="drawer-section-title">Reason / Business Justification</span>
            <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--text-primary)' }}>
              {leave.reason || 'No specific notes provided.'}
            </div>
          </div>

          {/* Vertical Approval Workflow Timeline */}
          <div className="drawer-section">
            <span className="drawer-section-title">Approval Workflow Timeline</span>
            <div className="timeline-workflow">
              {/* Step 1: Submission */}
              <div className="timeline-step">
                <div className="timeline-line"></div>
                <div className="timeline-node done">✓</div>
                <div className="timeline-content">
                  <div className="timeline-actor-row">
                    <span className="timeline-actor">{leave.requesterName || activeUser?.name}</span>
                    <span className="timeline-time">Submitted</span>
                  </div>
                  <span className="timeline-role">Requester • {leave.workingDays || leave.working_days} days requested</span>
                </div>
              </div>

              {/* History steps */}
              {history.map((h, i) => (
                <div key={i} className="timeline-step">
                  <div className="timeline-line"></div>
                  <div className="timeline-node done">✓</div>
                  <div className="timeline-content">
                    <div className="timeline-actor-row">
                      <span className="timeline-actor">{h.label || 'Approver'}</span>
                      <span className="timeline-time">{h.timestamp?.split('T')[0] || 'Approved'}</span>
                    </div>
                    <span className="timeline-role">Tier {i + 1} Review</span>
                    <span className="timeline-state-tag" style={{ color: '#166534' }}>✓ Approved</span>
                  </div>
                </div>
              ))}

              {/* Pending / Final Step */}
              {isPending && (
                <div className="timeline-step">
                  <div className="timeline-node active">⏳</div>
                  <div className="timeline-content">
                    <div className="timeline-actor-row">
                      <span className="timeline-actor">{leave.assignedApproverName || leave.approverName || 'Management Review'}</span>
                      <span className="timeline-time">In Review</span>
                    </div>
                    <span className="timeline-role">Tier {leave.currentTier || 1} of {leave.requiredTiers || 1} required</span>
                    <span className="timeline-state-tag" style={{ color: '#92400e' }}>Awaiting Manager Decision</span>
                  </div>
                </div>
              )}

              {leave.status === 'APPROVED' && (
                <div className="timeline-step">
                  <div className="timeline-node done">✓</div>
                  <div className="timeline-content">
                    <div className="timeline-actor-row">
                      <span className="timeline-actor">Final Approval</span>
                      <span className="timeline-time">Completed</span>
                    </div>
                    <span className="timeline-role">{leave.decidedBy || 'Fully Approved'}</span>
                  </div>
                </div>
              )}

              {leave.status === 'REJECTED' && (
                <div className="timeline-step">
                  <div className="timeline-node rejected">✗</div>
                  <div className="timeline-content">
                    <div className="timeline-actor-row">
                      <span className="timeline-actor">Request Rejected</span>
                      <span className="timeline-time">Closed</span>
                    </div>
                    <span className="timeline-role">{leave.decidedBy || 'Rejected by Manager'}</span>
                  </div>
                </div>
              )}

              {leave.status === 'WITHDRAWN' && (
                <div className="timeline-step">
                  <div className="timeline-node">↩️</div>
                  <div className="timeline-content">
                    <div className="timeline-actor-row">
                      <span className="timeline-actor">Request Withdrawn</span>
                      <span className="timeline-time">Cancelled</span>
                    </div>
                    <span className="timeline-role">Withdrawn by requester (&gt;12h before start date)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="drawer-footer">
          {onDownloadReport && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onDownloadReport(leave.userId || leave.user_id || activeUser?.id, leave.requesterName || activeUser?.name)}
            >
              📥 Export CSV
            </button>
          )}

          {isPending && isApprover && onApprove && (
            <button className="btn btn-primary btn-sm" onClick={() => { onApprove(leave.id); onClose(); }}>
              ✓ Approve Request
            </button>
          )}

          {isPending && isApprover && onReject && (
            <button className="btn btn-destructive btn-sm" onClick={() => { onReject(leave.id); onClose(); }}>
              ✗ Reject Request
            </button>
          )}

          {isPending && isRequester && onWithdraw && (
            <button className="btn btn-secondary btn-sm" onClick={() => { onWithdraw(leave.id); onClose(); }}>
              ↩️ Withdraw Leave
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 5. MAIN APPLICATION COMPONENT
// =========================================================================

export default function App() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [activeUser, setActiveUser] = useState(null);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [showCopilotDrawer, setShowCopilotDrawer] = useState(false);

  // Active Navigation View: 'dashboard', 'leaves', 'approvals', 'team', 'calendar', 'reports', 'policies', 'holidays', 'delegation', 'handbook'
  const [activeNav, setActiveNav] = useState('dashboard');

  // Selected leave for drawer inspection
  const [selectedLeave, setSelectedLeave] = useState(null);

  // Leave Form State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState(STANDARD_LEAVE_TYPES[0]);
  const [reason, setReason] = useState('');

  // Data states
  const [requests, setRequests] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [balance, setBalance] = useState({ accrued: 0, used: 0, available: 0, baseLeave: 10, accrualRate: 1 });
  const [analyticsData, setAnalyticsData] = useState(null);
  const [teamLeavesData, setTeamLeavesData] = useState(null);
  const [handbookData, setHandbookData] = useState([]);

  // Filter states
  const [tableSearch, setTableSearch] = useState('');
  const [tableRoleFilter, setTableRoleFilter] = useState('ALL');
  const [tableStatusFilter, setTableStatusFilter] = useState('ALL');

  // Slack Integration State
  const [slackStatus, setSlackStatus] = useState({ connected: false });
  const [slackLoading, setSlackLoading] = useState(false);

  // Availability & Substitution State
  const [availabilityStatus, setAvailabilityStatus] = useState('AVL');
  const [delegateId, setDelegateId] = useState('');
  const [updatingAvailability, setUpdatingAvailability] = useState(false);

  // Policy state for Admin
  const [policies, setPolicies] = useState({
    baseLeave: 10.0,
    employeeRate: 1.0,
    managerRate: 2.0,
    seniorManagerRate: 4.0,
    directorRate: 5.0,
    vpRate: 5.0,
    partTimeRate: 0.5,
  });
  const [savingPolicies, setSavingPolicies] = useState(false);

  // Holidays state
  const [holidays, setHolidays] = useState([]);
  const [filterRegion, setFilterRegion] = useState('ALL');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayRegion, setNewHolidayRegion] = useState('US');

  // Admin New Employee State
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpRole, setNewEmpRole] = useState('Employee');
  const [newEmpType, setNewEmpType] = useState('Full-Time');
  const [newEmpManagerId, setNewEmpManagerId] = useState('');
  const [newEmpJoinDate, setNewEmpJoinDate] = useState('2025-01-01');
  const [newEmpRegion, setNewEmpRegion] = useState('US');
  const [emergencyPrompt, setEmergencyPrompt] = useState(null);
  const [addingEmployee, setAddingEmployee] = useState(false);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handle URL Slack query callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slack') === 'connected') {
      setSuccess('Slack account connected! Your custom status will update to 🏖️ On Leave during approved leaves.');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('slack_error')) {
      setError(`Slack connection failed: ${params.get('slack_error')}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const isPastDate = (() => {
    if (!startDate && !endDate) return false;
    const today = new Date();
    const todayYmd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const targetDate = endDate ? new Date(endDate) : new Date(startDate);
    const targetYmd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    return targetYmd < todayYmd;
  })();

  const availableLeaveTypes = isPastDate ? [EMERGENCY_LEAVE_TYPE] : STANDARD_LEAVE_TYPES;

  useEffect(() => {
    if (isPastDate) {
      setLeaveType(EMERGENCY_LEAVE_TYPE);
    } else if (leaveType === EMERGENCY_LEAVE_TYPE) {
      setLeaveType(STANDARD_LEAVE_TYPES[0]);
    }
  }, [isPastDate]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/users`);
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data);
      if (!selectedUserId && data.length > 0) {
        setSelectedUserId(data[0].id.toString());
      }
    } catch {
      setError('Could not connect to backend server.');
    }
  };

  const fetchPolicies = async () => {
    try {
      const res = await fetch(`${API_URL}/policies`);
      if (res.ok) setPolicies(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHandbook = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rag/handbook`);
      if (res.ok) setHandbookData(await res.json());
    } catch {}
  };

  const fetchSlackStatus = async (userId) => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_URL}/api/slack/status?userId=${userId}`);
      if (res.ok) setSlackStatus(await res.json());
    } catch {}
  };

  const fetchAnalytics = async (mgrId) => {
    if (!mgrId) return;
    try {
      const res = await fetch(`${API_URL}/dashboard/team/${mgrId}?callerId=${selectedUserId}`);
      if (res.ok) setAnalyticsData(await res.json());
    } catch {}
  };

  const fetchTeamLeaves = async (mgrId) => {
    if (!mgrId) return;
    try {
      const res = await fetch(`${API_URL}/leave/team?managerId=${mgrId}&callerId=${selectedUserId}`);
      if (res.ok) setTeamLeavesData(await res.json());
    } catch {}
  };

  const fetchHolidays = async (reg) => {
    try {
      const q = reg && reg !== 'ALL' ? `?region=${reg}` : '';
      const res = await fetch(`${API_URL}/holidays${q}`);
      if (res.ok) setHolidays(await res.json());
    } catch {}
  };

  const fetchData = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      if (activeUser?.isAdmin) {
        await Promise.all([fetchUsers(), fetchPolicies(), fetchHolidays(filterRegion), fetchHandbook()]);
      } else {
        const promises = [
          fetch(`${API_URL}/leave/requests?userId=${selectedUserId}`).then(r => r.ok && r.json()).then(d => d && setRequests(d)),
          fetch(`${API_URL}/leave/approvals?userId=${selectedUserId}`).then(r => r.ok && r.json()).then(d => d && setApprovals(d)),
          fetch(`${API_URL}/leave/balance?userId=${selectedUserId}`).then(r => r.ok && r.json()).then(d => d && setBalance(d)),
          fetchSlackStatus(selectedUserId),
          fetchHolidays(filterRegion),
          fetchHandbook()
        ];

        if (isManagerOrAbove) {
          promises.push(fetchAnalytics(selectedUserId));
          promises.push(fetchTeamLeaves(selectedUserId));
        }

        await Promise.all(promises);
      }
    } catch {
      setError('Could not retrieve user data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchPolicies();
    fetchHandbook();
  }, []);

  useEffect(() => {
    if (selectedUserId && users.length > 0) {
      const found = users.find(u => u.id.toString() === selectedUserId);
      setActiveUser(found || null);
      if (found) {
        setAvailabilityStatus(found.availabilityStatus || 'AVL');
        setDelegateId(found.delegateId ? found.delegateId.toString() : '');
        fetchSlackStatus(found.id);
      }
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    if (selectedUserId) {
      setError(''); setSuccess('');
      fetchData();
    }
  }, [selectedUserId, activeUser?.isAdmin]);

  const isManagerOrAbove = activeUser && ['Manager', 'Senior Manager', 'Director', 'Vice President'].includes(activeUser.role);

  // Filter delegates to strictly higher authorities
  const eligibleDelegates = users.filter(u => {
    if (u.isAdmin || u.id.toString() === selectedUserId) return false;
    const currentRank = ROLE_RANKS[activeUser?.role] || 1;
    const targetRank = ROLE_RANKS[u.role] || 1;
    return currentRank >= 4 ? targetRank >= currentRank : targetRank > currentRank;
  });

  // Action Handlers
  const handleApplyLeave = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate) return setError('Please select start and end dates.');
    setSubmitting(true); setError(''); setSuccess(''); setEmergencyPrompt(null);

    try {
      const res = await fetch(`${API_URL}/leave/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          userId: parseInt(selectedUserId),
          leaveType,
          reason,
        }),
      });

      const d = await res.json();

      if (res.status === 422 || d.isNegativeAccrual) {
        setEmergencyPrompt({
          startDate,
          endDate,
          reason,
          workingDays: d.workingDays,
          availableBalance: d.availableBalance,
          leaveType: d.leaveType || leaveType,
          errorMsg: d.error
        });
        await fetchData();
        return;
      }

      if (!res.ok) {
        throw new Error(d.error || 'Failed to submit request');
      }

      const created = d;
      setSuccess(`Leave request #${created.id} submitted successfully (${created.status})!`);
      setStartDate(''); setEndDate(''); setReason('');
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyEmergencyFromPrompt = async () => {
    if (!emergencyPrompt) return;
    setSubmitting(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/leave/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: emergencyPrompt.startDate,
          endDate: emergencyPrompt.endDate,
          userId: parseInt(selectedUserId),
          leaveType: 'Emergency Leave',
          reason: emergencyPrompt.reason ? `[EMERGENCY] ${emergencyPrompt.reason}` : '[EMERGENCY LEAVE]',
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to submit emergency leave');
      setSuccess(`Emergency Leave request #${d.id} submitted for 2-Tier Managerial Approval!`);
      setEmergencyPrompt(null);
      setStartDate(''); setEndDate(''); setReason('');
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (leaveId) => {
    if (!window.confirm('Withdraw this pending leave request?')) return;
    setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/leave/requests/${leaveId}/withdraw`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: parseInt(selectedUserId) })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Withdrawal failed');

      setSuccess(`Leave request #${leaveId} has been withdrawn.`);
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleApprove = async (id) => {
    setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/leave/requests/${id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approverId: parseInt(selectedUserId) })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const updated = await res.json();
      setSuccess(`Leave request #${id} ${updated.status === 'APPROVED' ? 'approved' : 'advanced to next tier'}.`);
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = async (id) => {
    setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/leave/requests/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approverId: parseInt(selectedUserId) })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSuccess(`Leave request #${id} rejected.`);
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateAvailability = async (newStatus, newDelegateId) => {
    setUpdatingAvailability(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/users/${selectedUserId}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availabilityStatus: newStatus,
          delegateId: newStatus === 'UN_AVL' && newDelegateId ? parseInt(newDelegateId) : null
        })
      });
      if (!res.ok) throw new Error('Failed to update availability');
      const data = await res.json();
      setAvailabilityStatus(data.availabilityStatus);
      setDelegateId(data.delegateId ? data.delegateId.toString() : '');
      setSuccess(`Availability updated to ${newStatus === 'UN_AVL' ? 'On Leave (Delegated)' : 'Available'}.`);
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const handleSavePolicies = async (e) => {
    e.preventDefault();
    setSavingPolicies(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policies)
      });
      if (!res.ok) throw new Error('Failed to update policies');
      const data = await res.json();
      setPolicies(data.policies);
      setSuccess('Corporate accrual policies updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPolicies(false);
    }
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpJoinDate) return setError('Name and Join Date are required.');
    setAddingEmployee(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newEmpName.trim(),
          email: newEmpEmail.trim() || null,
          role: newEmpRole,
          employmentType: newEmpType,
          managerId: newEmpManagerId ? parseInt(newEmpManagerId) : null,
          joinDate: newEmpJoinDate,
          region: newEmpRegion
        })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const created = await res.json();
      setSuccess(`Employee "${created.name}" created.`);
      setNewEmpName(''); setNewEmpEmail('');
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingEmployee(false);
    }
  };

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName) return setError('Date and Name are required.');
    try {
      const res = await fetch(`${API_URL}/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: newHolidayRegion,
          holidayDate: newHolidayDate,
          name: newHolidayName
        })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSuccess('Holiday added.');
      setNewHolidayName(''); setNewHolidayDate('');
      await fetchHolidays(filterRegion);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteHoliday = async (id) => {
    if (!window.confirm('Delete this holiday?')) return;
    try {
      const res = await fetch(`${API_URL}/holidays/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete holiday');
      setSuccess('Holiday deleted.');
      fetchHolidays(filterRegion);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownloadReport = (targetUserId, targetUserName) => {
    const downloadUrl = `${API_URL}/reports/user/${targetUserId}/download?callerId=${selectedUserId}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `leave_report_${targetUserId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSuccess(`Downloaded CSV report for ${targetUserName || `Employee #${targetUserId}`}.`);
  };

  const handleConnectSlack = () => {
    if (!selectedUserId) return;
    window.location.href = `${API_URL}/api/slack/oauth/authorize?userId=${selectedUserId}`;
  };

  const handleDisconnectSlack = async () => {
    if (!selectedUserId) return;
    setSlackLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/api/slack/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: parseInt(selectedUserId) })
      });
      if (!res.ok) throw new Error('Failed to disconnect Slack');
      setSuccess('Slack disconnected.');
      await fetchSlackStatus(selectedUserId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSlackLoading(false);
    }
  };

  // Filter team members in Team view
  const filteredTeamMembers = (analyticsData?.teamMembers || []).filter(m => {
    const q = tableSearch.toLowerCase();
    const matchesSearch = tableSearch === '' || m.name.toLowerCase().includes(q) || (m.email && m.email.toLowerCase().includes(q)) || (m.managerName && m.managerName.toLowerCase().includes(q));
    const matchesRole = tableRoleFilter === 'ALL' || m.role === tableRoleFilter;
    const matchesStatus = tableStatusFilter === 'ALL' || m.status === tableStatusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="app-shell">
      {/* ========================================================================= */}
      {/* 1. PERSISTENT ENTERPRISE SIDEBAR (250px)                                  */}
      {/* ========================================================================= */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo-icon">LM</div>
          <span className="sidebar-logo-text">Leave Management</span>
        </div>

        <nav className="sidebar-nav">
          {/* If System Administrator, show Admin Console Navigation */}
          {activeUser?.isAdmin ? (
            <div className="nav-section">
              <span className="nav-section-title">Administration Console</span>
              <button className={`nav-item ${activeNav === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveNav('dashboard')}>
                <div className="nav-item-left">
                  <span className="nav-icon">📊</span>
                  <span>Admin Overview</span>
                </div>
              </button>

              <button className={`nav-item ${activeNav === 'employees' ? 'active' : ''}`} onClick={() => setActiveNav('employees')}>
                <div className="nav-item-left">
                  <span className="nav-icon">👥</span>
                  <span>Employee Directory</span>
                </div>
                <span className="nav-count-badge">{users.length}</span>
              </button>

              <button className={`nav-item ${activeNav === 'policies' ? 'active' : ''}`} onClick={() => setActiveNav('policies')}>
                <div className="nav-item-left">
                  <span className="nav-icon">⚙️</span>
                  <span>Accrual Policies</span>
                </div>
              </button>

              <button className={`nav-item ${activeNav === 'holidays' ? 'active' : ''}`} onClick={() => setActiveNav('holidays')}>
                <div className="nav-item-left">
                  <span className="nav-icon">🗓</span>
                  <span>Holiday Calendar</span>
                </div>
                <span className="nav-count-badge">{holidays.length}</span>
              </button>

              <button className={`nav-item ${activeNav === 'handbook' ? 'active' : ''}`} onClick={() => setActiveNav('handbook')}>
                <div className="nav-item-left">
                  <span className="nav-icon">📜</span>
                  <span>Policy Handbook</span>
                </div>
              </button>
            </div>
          ) : (
            /* Corporate Workspace Section for Employees & Managers */
            <div className="nav-section">
              <span className="nav-section-title">Workspace</span>
              <button className={`nav-item ${activeNav === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveNav('dashboard')}>
                <div className="nav-item-left">
                  <span className="nav-icon">📊</span>
                  <span>Dashboard</span>
                </div>
              </button>

              <button className={`nav-item ${activeNav === 'leaves' ? 'active' : ''}`} onClick={() => setActiveNav('leaves')}>
                <div className="nav-item-left">
                  <span className="nav-icon">📋</span>
                  <span>My Leaves</span>
                </div>
                <span className="nav-count-badge">{requests.length}</span>
              </button>

              {isManagerOrAbove && (
                <>
                  <button className={`nav-item ${activeNav === 'approvals' ? 'active' : ''}`} onClick={() => setActiveNav('approvals')}>
                    <div className="nav-item-left">
                      <span className="nav-icon">📥</span>
                      <span>Approvals</span>
                    </div>
                    {approvals.length > 0 && <span className="nav-count-badge" style={{ backgroundColor: '#2563eb', color: '#fff' }}>{approvals.length}</span>}
                  </button>

                  <button className={`nav-item ${activeNav === 'team' ? 'active' : ''}`} onClick={() => setActiveNav('team')}>
                    <div className="nav-item-left">
                      <span className="nav-icon">👥</span>
                      <span>Team</span>
                    </div>
                    <span className="nav-count-badge">{analyticsData?.overview?.totalEmployees || 0}</span>
                  </button>

                  <button className={`nav-item ${activeNav === 'calendar' ? 'active' : ''}`} onClick={() => setActiveNav('calendar')}>
                    <div className="nav-item-left">
                      <span className="nav-icon">📅</span>
                      <span>Calendar</span>
                    </div>
                    {teamLeavesData?.alertDates?.length > 0 && <span className="nav-alert-badge">!</span>}
                  </button>
                </>
              )}

              <button className={`nav-item ${activeNav === 'holidays' ? 'active' : ''}`} onClick={() => setActiveNav('holidays')}>
                <div className="nav-item-left">
                  <span className="nav-icon">🗓</span>
                  <span>Holidays</span>
                </div>
              </button>

              <button className={`nav-item ${activeNav === 'handbook' ? 'active' : ''}`} onClick={() => setActiveNav('handbook')}>
                <div className="nav-item-left">
                  <span className="nav-icon">📜</span>
                  <span>Policy Handbook</span>
                </div>
              </button>
            </div>
          )}

          {/* AI Intelligence Section */}
          <div className="nav-section">
            <span className="nav-section-title">AI Intelligence</span>
            <button className="nav-item" onClick={() => setShowCopilotDrawer(true)} style={{ color: 'var(--brand)' }}>
              <div className="nav-item-left">
                <span className="nav-icon">🤖</span>
                <span style={{ fontWeight: 600 }}>HR Policy Copilot</span>
              </div>
              <span className="badge badge-approved" style={{ fontSize: '9px', padding: '1px 4px' }}>RAG</span>
            </button>
          </div>

          {/* Management Section (Only for Managers) */}
          {!activeUser?.isAdmin && isManagerOrAbove && (
            <div className="nav-section">
              <span className="nav-section-title">Management</span>
              <button className={`nav-item ${activeNav === 'delegation' ? 'active' : ''}`} onClick={() => setActiveNav('delegation')}>
                <div className="nav-item-left">
                  <span className="nav-icon">🤝</span>
                  <span>Delegation</span>
                </div>
                <span className={`badge ${availabilityStatus === 'AVL' ? 'badge-approved' : 'badge-rejected'}`} style={{ fontSize: '9px', padding: '0 4px' }}>
                  {availabilityStatus}
                </span>
              </button>
            </div>
          )}
        </nav>

        {/* Sidebar Footer User Profile */}
        <div className="sidebar-footer">
          <div className="sidebar-user-card" onClick={() => setShowPersonaModal(true)} title="Click to switch simulated persona">
            <div className={`user-avatar ${activeUser?.isAdmin ? 'avatar-admin' : isManagerOrAbove ? 'avatar-exec' : ''}`}>
              {activeUser?.isAdmin ? '⚙️' : activeUser?.role === 'Director' ? '👑' : isManagerOrAbove ? '🔷' : '👤'}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{activeUser?.name || 'Loading...'}</span>
              <span className="sidebar-user-role">{activeUser?.role} • {activeUser?.region}</span>
            </div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>▼</span>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. TOP HEADER & MAIN SCROLL CONTAINER                                     */}
      {/* ========================================================================= */}
      <div className="main-wrapper">
        <header className="top-header">
          <div className="header-left">
            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">
                {activeNav === 'dashboard' && 'Dashboard Overview'}
                {activeNav === 'leaves' && 'My Leave Requests'}
                {activeNav === 'approvals' && 'Pending Approvals'}
                {activeNav === 'team' && 'Team Analytics & Hierarchy'}
                {activeNav === 'calendar' && 'Subordinate Team Calendar'}
                {activeNav === 'holidays' && 'Corporate Public Holidays'}
                {activeNav === 'handbook' && 'Global Policy Handbook'}
                {activeNav === 'employees' && 'Employee Directory'}
                {activeNav === 'policies' && 'Accrual Policy Engine'}
                {activeNav === 'delegation' && 'Manager Delegation'}
              </span>
            </div>
          </div>

          <div className="header-right">
            {/* Direct HR Policy Copilot Button in Header */}
            <button className="copilot-trigger-btn" onClick={() => setShowCopilotDrawer(true)}>
              <span>🤖 Ask HR Copilot</span>
            </button>

            <button className="persona-switcher-btn" onClick={() => setShowPersonaModal(true)}>
              <span>Switch Persona</span>
              <span className="persona-tag">{activeUser?.role}</span>
            </button>
          </div>
        </header>

        {/* Global Notifications */}
        {error && (
          <div style={{ padding: '8px 40px 0' }}>
            <div className="alert-banner alert-banner-error">
              <span>⚠️ {error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
            </div>
          </div>
        )}
        {success && (
          <div style={{ padding: '8px 40px 0' }}>
            <div className="alert-banner alert-banner-success">
              <span>✓ {success}</span>
              <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. MAIN CONTENT VIEWS                                                     */}
        {/* ========================================================================= */}
        <main className="content-body">
          <div className="content-container">
            {/* ----------------------------------------------------------------- */}
            {/* VIEW A: DASHBOARD OVERVIEW                                        */}
            {/* ----------------------------------------------------------------- */}
            {activeNav === 'dashboard' && activeUser?.isAdmin && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">HR System Administration</span>
                    <h1 className="page-title">Executive Admin Console</h1>
                    <p className="page-subtitle">Global organization workforce metrics, dynamic accrual policy engine, and regional holiday calendars.</p>
                  </div>
                  <div className="page-header-actions">
                    <button className="btn btn-primary" onClick={() => setActiveNav('employees')}>
                      + Onboard Employee
                    </button>
                  </div>
                </div>

                {/* Admin KPI Stat Blocks */}
                <div className="stat-grid">
                  <div className="stat-block">
                    <span className="stat-label">Total Organization Headcount</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{users.length}</span>
                      <span className="stat-unit">members</span>
                    </div>
                    <span className="stat-footer">{users.filter(u => !u.isAdmin).length} active corporate personnel</span>
                  </div>

                  <div className="stat-block">
                    <span className="stat-label">Dynamic Accrual Engine</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{policies.baseLeave}</span>
                      <span className="stat-unit">base days</span>
                    </div>
                    <span className="stat-footer">Role rates: 1d to 5d / month</span>
                  </div>

                  <div className="stat-block">
                    <span className="stat-label">Configured Public Holidays</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{holidays.length}</span>
                      <span className="stat-unit">holidays</span>
                    </div>
                    <span className="stat-footer">Across US, IN, and UK regions</span>
                  </div>

                  <div className="stat-block">
                    <span className="stat-label">AI Policy Knowledge Chunks</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{handbookData.length || 9}</span>
                      <span className="stat-unit">sections</span>
                    </div>
                    <span className="stat-footer">RAG embedding store active</span>
                  </div>
                </div>

                {/* Admin Quick Action Shortcuts */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  <div className="table-wrapper" style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={() => setActiveNav('employees')}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>👥 Employee Directory & Hiring</div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Manage corporate personnel, job roles, reporting managers, and employment types.</p>
                  </div>

                  <div className="table-wrapper" style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={() => setActiveNav('policies')}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>⚙️ Corporate Accrual Policies</div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Configure dynamic monthly accrual rates and base leave quotas across all role tiers.</p>
                  </div>

                  <div className="table-wrapper" style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={() => setActiveNav('holidays')}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>🗓 Holiday Calendar Manager</div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Add and maintain regional public holidays for US, IN, and UK operating branches.</p>
                  </div>

                  <div className="table-wrapper" style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={() => setShowCopilotDrawer(true)}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--brand)', marginBottom: '4px' }}>🤖 AI HR Policy Copilot</div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Query the RAG knowledge base for instant answers on maternity, sick certificates, etc.</p>
                  </div>
                </div>

                {/* Complete Organization Table */}
                <div className="table-wrapper">
                  <div className="table-toolbar">
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Organization Overview ({users.length} Employees)</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setActiveNav('employees')}>Full Directory & Onboard →</button>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Type</th>
                        <th>Reporting Manager</th>
                        <th>Region</th>
                        <th>Join Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>#{u.id}</td>
                          <td>
                            <strong>{u.name}</strong>
                            {u.email && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{u.email}</div>}
                          </td>
                          <td>
                            <span>{u.role}</span>
                            {u.isAdmin && <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e', marginLeft: '6px' }}>Admin</span>}
                          </td>
                          <td>{u.employmentType || 'Full-Time'}</td>
                          <td>{u.managerName ? `${u.managerName} (${u.managerRole})` : '—'}</td>
                          <td>{u.region || 'US'}</td>
                          <td>{u.joinDate?.split('T')[0]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Corporate Dashboard Overview for Non-Admin Personas */}
            {activeNav === 'dashboard' && !activeUser?.isAdmin && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">Overview</span>
                    <h1 className="page-title">Good morning, {activeUser?.name?.split(' ')[0] || 'there'}</h1>
                    <p className="page-subtitle">Here is what is happening with your leave allowance and team schedule today.</p>
                  </div>
                  <div className="page-header-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowCopilotDrawer(true)} style={{ marginRight: '6px' }}>
                      🤖 Ask Policy AI
                    </button>
                    <button className="btn btn-primary" onClick={() => setActiveNav('leaves')}>
                      + Apply Leave
                    </button>
                  </div>
                </div>

                {/* Minimal Stat Blocks Row */}
                <div className="stat-grid">
                  <div className="stat-block">
                    <span className="stat-label">Available Balance</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{balance.available.toFixed(1)}</span>
                      <span className="stat-unit">days</span>
                    </div>
                    <span className="stat-footer">Total accrued: {balance.accrued.toFixed(1)}d</span>
                  </div>

                  <div className="stat-block">
                    <span className="stat-label">Leave Used (YTD)</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{balance.used.toFixed(1)}</span>
                      <span className="stat-unit">days</span>
                    </div>
                    <span className="stat-footer">Across {requests.filter(r => r.status === 'APPROVED').length} approved leaves</span>
                  </div>

                  <div className="stat-block">
                    <span className="stat-label">Pending Reviews</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{approvals.length}</span>
                      <span className="stat-unit">requests</span>
                    </div>
                    <span className="stat-footer">{isManagerOrAbove ? 'Requires your review' : 'No action required'}</span>
                  </div>

                  <div className="stat-block">
                    <span className="stat-label">Accrual Rate</span>
                    <div className="stat-value-row">
                      <span className="stat-value">+{balance.accrualRate || 1}</span>
                      <span className="stat-unit">d/month</span>
                    </div>
                    <span className="stat-footer">Base quota: {balance.baseLeave || 10}d</span>
                  </div>
                </div>

                {/* Slack Integration Strip */}
                <div className="slack-strip">
                  <div className="slack-strip-left">
                    <div className="slack-hash-icon">#</div>
                    <div className="slack-strip-text">
                      <span className="slack-strip-title">
                        Slack Status Integration
                        <span className={`badge ${slackStatus.connected ? 'badge-approved' : 'badge-withdrawn'}`}>
                          {slackStatus.connected ? 'Connected' : 'Not Connected'}
                        </span>
                      </span>
                      <span className="slack-strip-desc">
                        {slackStatus.connected
                          ? `Syncing with Slack (@${slackStatus.slackUser?.name || 'user'}). Status updates to 🏖️ On Leave during approved leaves.`
                          : 'Connect Slack to automatically set your custom status during approved leaves.'}
                      </span>
                    </div>
                  </div>
                  <div>
                    {slackStatus.connected ? (
                      <button className="btn btn-secondary btn-sm" onClick={handleDisconnectSlack} disabled={slackLoading}>
                        {slackLoading ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={handleConnectSlack}>
                        Connect Slack
                      </button>
                    )}
                  </div>
                </div>

                {/* Pending Approvals Table (if Manager) */}
                {approvals.length > 0 && (
                  <div className="table-wrapper">
                    <div className="table-toolbar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>Pending Approvals</span>
                        <span className="badge badge-pending">{approvals.length} action required</span>
                      </div>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Requester</th>
                          <th>Leave Type</th>
                          <th>Dates</th>
                          <th>Duration</th>
                          <th>Reason</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvals.map(a => (
                          <tr key={a.id} onClick={() => setSelectedLeave(a)}>
                            <td>
                              <strong>{a.requesterName}</strong>
                              <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginLeft: '6px' }}>{a.requesterRole}</span>
                            </td>
                            <td>{a.leaveType}</td>
                            <td>{a.startDate} → {a.endDate}</td>
                            <td><strong>{a.workingDays}d</strong></td>
                            <td style={{ color: 'var(--text-secondary)' }}>{a.reason || '—'}</td>
                            <td><span className="badge badge-pending">Tier {a.currentTier || 1} Pending</span></td>
                            <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              <button className="btn btn-primary btn-sm" style={{ marginRight: '6px' }} onClick={() => handleApprove(a.id)}>Approve</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => handleReject(a.id)}>Reject</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Recent Leaves Table */}
                <div className="table-wrapper">
                  <div className="table-toolbar">
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Recent Personal Requests</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setActiveNav('leaves')}>View all →</button>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Leave Type</th>
                        <th>Dates</th>
                        <th>Days</th>
                        <th>Status</th>
                        <th>Decision Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.slice(0, 5).map(r => (
                        <tr key={r.id} onClick={() => setSelectedLeave(r)}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>#{r.id}</td>
                          <td><strong>{r.leaveType}</strong></td>
                          <td>{r.startDate} → {r.endDate}</td>
                          <td>{r.workingDays}d</td>
                          <td><span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span></td>
                          <td style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{r.decidedBy || 'Under review'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* VIEW B: MY LEAVES (APPLY & LIST)                                  */}
            {/* ----------------------------------------------------------------- */}
            {activeNav === 'leaves' && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">Personal Leaves</span>
                    <h1 className="page-title">My Leave Requests</h1>
                    <p className="page-subtitle">Submit new leave applications and track decision status across all tiers.</p>
                  </div>
                  <div className="page-header-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowCopilotDrawer(true)} style={{ marginRight: '6px' }}>
                      🤖 Check Leave Policy
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadReport(selectedUserId, activeUser?.name)}>
                      📥 Export CSV
                    </button>
                  </div>
                </div>

                {/* Interactive Auto-Rejection to Emergency Conversion Card */}
                {emergencyPrompt && (
                  <div style={{ backgroundColor: '#fff', border: '1px solid #f87171', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '20px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                      <span style={{ fontSize: '28px' }}>🚨</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <h4 style={{ margin: 0, fontSize: '15px', color: '#991b1b', fontWeight: 700 }}>
                            Leave Request Auto-Rejected (Insufficient Balance)
                          </h4>
                          <span className="badge badge-rejected" style={{ fontSize: '10px' }}>Auto-Rejected</span>
                        </div>
                        <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          Your application for <strong>{emergencyPrompt.workingDays} working days</strong> of <strong>{emergencyPrompt.leaveType}</strong> ({emergencyPrompt.startDate} → {emergencyPrompt.endDate}) was automatically recorded as <strong>REJECTED</strong> because your available accrual balance is <strong>{emergencyPrompt.availableBalance} days</strong>. An official notification has been emailed to you.
                        </p>
                        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#991b1b', lineHeight: 1.5 }}>
                          <strong>Emergency Leave Option:</strong> If this is an urgent or emergency circumstance, you can apply using <strong>Emergency Leave</strong>. This protocol bypasses regular balance limits and routes for <strong>mandatory 2-Tier Managerial + Executive Approval</strong> (even for 1-day leaves).
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <button
                            className="btn btn-primary"
                            style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', fontWeight: 600 }}
                            onClick={handleApplyEmergencyFromPrompt}
                            disabled={submitting}
                          >
                            {submitting ? 'Submitting...' : '🚨 Apply as Emergency Leave (2-Tier Approval)'}
                          </button>
                          <button className="btn btn-secondary" onClick={() => setEmergencyPrompt(null)}>
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Apply Form */}
                <form onSubmit={handleApplyLeave} className="form-layout">
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>New Leave Application</span>

                  <div className="form-grid-2">
                    <div className="form-field">
                      <label>Start Date</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="form-input-text" />
                    </div>
                    <div className="form-field">
                      <label>End Date</label>
                      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="form-input-text" />
                    </div>
                  </div>

                  <div className="form-field">
                    <label>Leave Type</label>
                    <select value={leaveType} onChange={e => setLeaveType(e.target.value)} className="form-select-field">
                      {availableLeaveTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {leaveType === 'Emergency Leave' && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '12px', color: '#991b1b', lineHeight: 1.5 }}>
                      🚨 <strong>Emergency Leave Protocol:</strong> Applicable for urgent unforeseen circumstances or when available balance is insufficient/negative. Bypasses regular balance caps and routes for mandatory <strong>2-Tier Managerial + Executive Approval</strong> (even for 1-day leaves).
                    </div>
                  )}

                  <div className="form-field">
                    <label>Reason / Business Notes</label>
                    <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Provide brief reason..." className="form-textarea-field" />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => { setStartDate(''); setEndDate(''); setReason(''); }}>Clear</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </div>
                </form>

                {/* History Table */}
                <div className="table-wrapper">
                  <div className="table-toolbar">
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Leave Request History ({requests.length})</span>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Type</th>
                        <th>Dates</th>
                        <th>Days</th>
                        <th>Status</th>
                        <th>Decision / Reviewer</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.length === 0 ? (
                        <tr><td colSpan={7} className="table-empty-cell">No leave requests found.</td></tr>
                      ) : (
                        requests.map(r => (
                          <tr key={r.id} onClick={() => setSelectedLeave(r)}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>#{r.id}</td>
                            <td><strong>{r.leaveType}</strong></td>
                            <td>{r.startDate} → {r.endDate}</td>
                            <td>{r.workingDays}d</td>
                            <td><span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span></td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{r.decidedBy || (r.approverName ? `In review with ${r.approverName}` : 'In Review')}</td>
                            <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              {['PENDING', 'PENDING_TIER1', 'PENDING_TIER2'].includes(r.status) && (
                                <button className="btn btn-secondary btn-sm" onClick={() => handleWithdraw(r.id)}>
                                  ↩️ Withdraw
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* VIEW C: APPROVALS QUEUE (FOR MANAGERS)                            */}
            {/* ----------------------------------------------------------------- */}
            {activeNav === 'approvals' && isManagerOrAbove && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">Management Queue</span>
                    <h1 className="page-title">Pending Approvals</h1>
                    <p className="page-subtitle">Review, approve, or reject subordinate leave requests assigned to your queue.</p>
                  </div>
                </div>

                <div className="table-wrapper">
                  <div className="table-toolbar">
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Queue ({approvals.length})</span>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Requester</th>
                        <th>Leave Type</th>
                        <th>Dates</th>
                        <th>Days</th>
                        <th>Reason</th>
                        <th>Current Tier</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvals.length === 0 ? (
                        <tr><td colSpan={7} className="table-empty-cell">All caught up! No requests pending your approval.</td></tr>
                      ) : (
                        approvals.map(a => (
                          <tr key={a.id} onClick={() => setSelectedLeave(a)}>
                            <td>
                              <strong>{a.requesterName}</strong>
                              <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginLeft: '6px' }}>{a.requesterRole}</span>
                            </td>
                            <td>{a.leaveType}</td>
                            <td>{a.startDate} → {a.endDate}</td>
                            <td><strong>{a.workingDays}d</strong></td>
                            <td style={{ color: 'var(--text-secondary)' }}>{a.reason || '—'}</td>
                            <td><span className="badge badge-pending">Tier {a.currentTier || 1} of {a.requiredTiers || 1}</span></td>
                            <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              <button className="btn btn-primary btn-sm" style={{ marginRight: '6px' }} onClick={() => handleApprove(a.id)}>Approve</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => handleReject(a.id)}>Reject</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* VIEW D: TEAM ANALYTICS & HIERARCHY                                */}
            {/* ----------------------------------------------------------------- */}
            {activeNav === 'team' && isManagerOrAbove && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">Organization</span>
                    <h1 className="page-title">Team Analytics & Hierarchy</h1>
                    <p className="page-subtitle">Recursive organizational tree and leave utilization stats for all subordinates under {activeUser?.name}.</p>
                  </div>
                </div>

                {/* Team KPIs */}
                <div className="stat-grid">
                  <div className="stat-block">
                    <span className="stat-label">Total Downstream Team</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{analyticsData?.overview?.totalEmployees || 0}</span>
                      <span className="stat-unit">people</span>
                    </div>
                    <span className="stat-footer">{analyticsData?.scopeBreakdown?.directReports || 0} direct reports</span>
                  </div>

                  <div className="stat-block">
                    <span className="stat-label">Total Leave Taken</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{analyticsData?.overview?.totalLeaveTaken || 0}</span>
                      <span className="stat-unit">days</span>
                    </div>
                    <span className="stat-footer">YTD sum across all members</span>
                  </div>

                  <div className="stat-block">
                    <span className="stat-label">Average Utilization</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{analyticsData?.overview?.averageLeaveTaken || 0}</span>
                      <span className="stat-unit">d/person</span>
                    </div>
                    <span className="stat-footer">Team benchmark</span>
                  </div>

                  <div className="stat-block">
                    <span className="stat-label">Currently On Leave</span>
                    <div className="stat-value-row">
                      <span className="stat-value">{analyticsData?.overview?.currentlyOnLeave || 0}</span>
                      <span className="stat-unit">active today</span>
                    </div>
                    <span className="stat-footer">Live UNAVL status</span>
                  </div>
                </div>

                {/* Leave Utilization Rankings Grid (Lowest / Zero Leave & Highest Leave) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {/* Lowest Leave Utilization */}
                  <div className="table-wrapper" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>🌱 Lowest Leave Utilization</span>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Zero or minimum leave taken (Top available capacity)</div>
                      </div>
                      <span className="badge badge-approved" style={{ fontSize: '10px' }}>High Capacity</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(analyticsData?.rankings?.lowestLeaveUtilization || []).map((u, i) => (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', width: '18px' }}>#{i + 1}</span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{u.role}</span>
                            </div>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534' }}>{u.leaveUsed} days taken</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Highest Leave Utilization */}
                  <div className="table-wrapper" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>🔥 Highest Leave Utilization</span>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Most leave taken (Utilization tracking)</div>
                      </div>
                      <span className="badge badge-pending" style={{ fontSize: '10px' }}>Highest Usage</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(analyticsData?.rankings?.highestLeaveUtilization || []).map((u, i) => (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', width: '18px' }}>#{i + 1}</span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{u.role}</span>
                            </div>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e' }}>{u.leaveUsed} days taken</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Team Members Data Table with Filters */}
                <div className="table-wrapper">
                  <div className="table-toolbar">
                    <div className="table-filter-group">
                      <input
                        type="text"
                        placeholder="Search team member or manager..."
                        value={tableSearch}
                        onChange={e => setTableSearch(e.target.value)}
                        className="input-search-compact"
                      />
                      <select value={tableRoleFilter} onChange={e => setTableRoleFilter(e.target.value)} className="select-compact">
                        <option value="ALL">All Roles</option>
                        <option value="Employee">Employee</option>
                        <option value="Manager">Manager</option>
                        <option value="Senior Manager">Senior Manager</option>
                      </select>
                      <select value={tableStatusFilter} onChange={e => setTableStatusFilter(e.target.value)} className="select-compact">
                        <option value="ALL">All Statuses</option>
                        <option value="AVL">Available (AVL)</option>
                        <option value="UNAVL">On Leave (UNAVL)</option>
                      </select>
                    </div>
                  </div>

                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Role</th>
                        <th>Manager</th>
                        <th>Leave Taken</th>
                        <th>Remaining Balance</th>
                        <th>Status Today</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeamMembers.length === 0 ? (
                        <tr><td colSpan={7} className="table-empty-cell">No team members match the filter criteria.</td></tr>
                      ) : (
                        filteredTeamMembers.map(m => (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.name}</strong>
                              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{m.email}</div>
                            </td>
                            <td>{m.role}</td>
                            <td>{m.managerName || 'Top Level'}</td>
                            <td><strong>{m.leaveUsed}d</strong></td>
                            <td style={{ color: '#166534', fontWeight: 600 }}>{m.availableBalance}d</td>
                            <td>
                              <span className={`badge ${m.status === 'UNAVL' ? 'badge-rejected' : 'badge-approved'}`}>
                                {m.status === 'UNAVL' ? '🔴 UNAVL (On Leave)' : '🟢 AVL'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadReport(m.id, m.name)}>
                                📥 Report
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* VIEW E: SUBORDINATE TEAM CALENDAR & CLASH ALERTS                  */}
            {/* ----------------------------------------------------------------- */}
            {activeNav === 'calendar' && isManagerOrAbove && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">Schedule</span>
                    <h1 className="page-title">Subordinate Team Calendar</h1>
                    <p className="page-subtitle">Monthly visual calendar of all scheduled leaves across your reporting tree.</p>
                  </div>
                </div>

                {/* Consolidated Capacity Alerts */}
                {teamLeavesData?.alertDates?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {teamLeavesData.alertDates.map((alert, idx) => (
                      <div key={idx} className="alert-banner alert-banner-warning">
                        <span>
                          <strong>⚠️ Capacity Clash Alert ({alert.dateLabel || alert.date}):</strong> {alert.percentage}% of direct reports ({alert.onLeaveCount} of {alert.totalDirectReports}) are scheduled on leave ({alert.employeeNames.join(', ')}).
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <TeamCalendar teamData={teamLeavesData} holidays={holidays} onSelectLeave={(l) => setSelectedLeave(l)} />
              </>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* VIEW F: HOLIDAYS                                                  */}
            {/* ----------------------------------------------------------------- */}
            {activeNav === 'holidays' && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">Company Policy</span>
                    <h1 className="page-title">Corporate Public Holidays</h1>
                    <p className="page-subtitle">Official public company holidays across all operating regions.</p>
                  </div>
                  <div className="page-header-actions">
                    <select value={filterRegion} onChange={e => { setFilterRegion(e.target.value); fetchHolidays(e.target.value); }} className="select-compact">
                      <option value="ALL">All Regions</option>
                      <option value="US">Region US</option>
                      <option value="IN">Region IN</option>
                      <option value="UK">Region UK</option>
                    </select>
                  </div>
                </div>

                {/* If Admin, show Add Holiday form */}
                {activeUser?.isAdmin && (
                  <form onSubmit={handleAddHoliday} className="form-layout">
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Add Corporate Holiday</span>
                    <div className="form-grid-2">
                      <div className="form-field">
                        <label>Holiday Name</label>
                        <input type="text" placeholder="e.g. Labor Day" value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} required className="form-input-text" />
                      </div>
                      <div className="form-field">
                        <label>Date</label>
                        <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} required className="form-input-text" />
                      </div>
                    </div>
                    <div className="form-field">
                      <label>Region</label>
                      <select value={newHolidayRegion} onChange={e => setNewHolidayRegion(e.target.value)} className="form-select-field">
                        <option value="US">Region US</option>
                        <option value="IN">Region IN</option>
                        <option value="UK">Region UK</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary btn-sm">+ Add Holiday</button>
                    </div>
                  </form>
                )}

                <HolidayCalendar holidays={holidays} isAdmin={activeUser?.isAdmin} filterRegion={filterRegion} onDelete={handleDeleteHoliday} />
              </>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* VIEW G: GLOBAL POLICY HANDBOOK (NEW RAG KNOWLEDGE BASE)           */}
            {/* ----------------------------------------------------------------- */}
            {activeNav === 'handbook' && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">Corporate Governance</span>
                    <h1 className="page-title">Global Policy Handbook</h1>
                    <p className="page-subtitle">Official leave entitlements, medical certifications, maternity provisions, and approval escalation protocols.</p>
                  </div>
                  <div className="page-header-actions">
                    <button className="btn btn-primary" onClick={() => setShowCopilotDrawer(true)}>
                      🤖 Ask Policy AI Copilot
                    </button>
                  </div>
                </div>

                <div className="handbook-grid">
                  {handbookData.map(chunk => (
                    <div key={chunk.id} className="handbook-card">
                      <div className="handbook-card-header">
                        <span className="handbook-card-title">{chunk.sectionTitle}</span>
                        <span className="badge badge-withdrawn">{chunk.category}</span>
                      </div>
                      <div className="handbook-card-body">
                        {chunk.chunkText}
                      </div>
                      {chunk.keywords && chunk.keywords.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {chunk.keywords.slice(0, 4).map((k, i) => (
                            <span key={i} style={{ fontSize: '10px', color: 'var(--text-tertiary)', background: 'var(--bg-app)', padding: '1px 5px', borderRadius: '3px' }}>
                              #{k}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* VIEW H: MANAGER DELEGATION                                        */}
            {/* ----------------------------------------------------------------- */}
            {activeNav === 'delegation' && isManagerOrAbove && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">Manager Settings</span>
                    <h1 className="page-title">Approval Delegation & Substitution</h1>
                    <p className="page-subtitle">Configure substitute approver when you are away on leave.</p>
                  </div>
                </div>

                <div className="form-layout">
                  <div className="form-field">
                    <label>Current Availability Status</label>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <button
                        className={`btn ${availabilityStatus === 'AVL' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => handleUpdateAvailability('AVL', null)}
                        disabled={updatingAvailability}
                      >
                        🟢 Available (AVL)
                      </button>
                      <button
                        className={`btn ${availabilityStatus === 'UN_AVL' ? 'btn-destructive' : 'btn-secondary'}`}
                        onClick={() => handleUpdateAvailability('UN_AVL', delegateId)}
                        disabled={updatingAvailability}
                      >
                        🔴 On Leave (UN_AVL)
                      </button>
                    </div>
                  </div>

                  {availabilityStatus === 'UN_AVL' && (
                    <div className="form-field">
                      <label>Assigned Higher-Level Delegate</label>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        Per organizational policy, only authorities higher in your management chain can act as your substitute approver.
                      </p>
                      <select
                        value={delegateId}
                        onChange={e => {
                          setDelegateId(e.target.value);
                          handleUpdateAvailability('UN_AVL', e.target.value);
                        }}
                        className="form-select-field"
                      >
                        {eligibleDelegates.length === 0 ? (
                          <option value="" disabled>No higher-level delegates available (Top Executive)</option>
                        ) : (
                          <>
                            <option value="">Select Higher-Level Delegate...</option>
                            {eligibleDelegates.map(u => (
                              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* VIEW I: ADMIN EMPLOYEE DIRECTORY & ONBOARDING                    */}
            {/* ----------------------------------------------------------------- */}
            {activeNav === 'employees' && activeUser?.isAdmin && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">Administration</span>
                    <h1 className="page-title">Employee Directory & Onboarding</h1>
                    <p className="page-subtitle">Manage all corporate personnel and establish organizational reporting structures.</p>
                  </div>
                </div>

                {/* Add Employee Form */}
                <form onSubmit={handleAddEmployee} className="form-layout">
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Onboard New Employee</span>
                  <div className="form-grid-2">
                    <div className="form-field">
                      <label>Full Name</label>
                      <input type="text" placeholder="John Doe" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} required className="form-input-text" />
                    </div>
                    <div className="form-field">
                      <label>Email Address</label>
                      <input type="email" placeholder="john.doe@corp.com" value={newEmpEmail} onChange={e => setNewEmpEmail(e.target.value)} className="form-input-text" />
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-field">
                      <label>Job Role</label>
                      <select value={newEmpRole} onChange={e => setNewEmpRole(e.target.value)} className="form-select-field">
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Employment Type</label>
                      <select value={newEmpType} onChange={e => setNewEmpType(e.target.value)} className="form-select-field">
                        {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-field">
                      <label>Reporting Manager</label>
                      <select value={newEmpManagerId} onChange={e => setNewEmpManagerId(e.target.value)} className="form-select-field">
                        <option value="">None (Top Executive)</option>
                        {users.filter(u => !u.isAdmin).map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Region</label>
                      <select value={newEmpRegion} onChange={e => setNewEmpRegion(e.target.value)} className="form-select-field">
                        <option value="US">Region US</option>
                        <option value="IN">Region IN</option>
                        <option value="UK">Region UK</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-field">
                    <label>Join Date</label>
                    <input type="date" value={newEmpJoinDate} onChange={e => setNewEmpJoinDate(e.target.value)} required className="form-input-text" />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn btn-primary" disabled={addingEmployee}>
                      {addingEmployee ? 'Saving...' : 'Create Employee'}
                    </button>
                  </div>
                </form>

                {/* Directory Table */}
                <div className="table-wrapper">
                  <div className="table-toolbar">
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Organization Directory ({users.length})</span>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Employment</th>
                        <th>Reporting Manager</th>
                        <th>Region</th>
                        <th>Join Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>#{u.id}</td>
                          <td>
                            <strong>{u.name}</strong>
                            {u.email && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{u.email}</div>}
                          </td>
                          <td>{u.role}</td>
                          <td>{u.employmentType || 'Full-Time'}</td>
                          <td>{u.managerName ? `${u.managerName} (${u.managerRole})` : '—'}</td>
                          <td>{u.region || 'US'}</td>
                          <td>{u.joinDate?.split('T')[0]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ----------------------------------------------------------------- */}
            {/* VIEW J: ADMIN ACCRUAL POLICIES                                    */}
            {/* ----------------------------------------------------------------- */}
            {activeNav === 'policies' && activeUser?.isAdmin && (
              <>
                <div className="page-header">
                  <div className="page-header-text">
                    <span className="page-header-eyebrow">Administration</span>
                    <h1 className="page-title">Corporate Accrual Policies</h1>
                    <p className="page-subtitle">Configure base leave allowances and monthly leave accrual rates across organizational tiers.</p>
                  </div>
                </div>

                <form onSubmit={handleSavePolicies} className="form-layout">
                  <div className="form-field">
                    <label>Base Leave Entitlement (Days)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={policies.baseLeave}
                      onChange={e => setPolicies({ ...policies, baseLeave: parseFloat(e.target.value) || 0 })}
                      className="form-input-text"
                      required
                    />
                  </div>

                  <div className="form-grid-2">
                    <div className="form-field">
                      <label>Employee Rate (d/mo)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={policies.employeeRate}
                        onChange={e => setPolicies({ ...policies, employeeRate: parseFloat(e.target.value) || 0 })}
                        className="form-input-text"
                      />
                    </div>
                    <div className="form-field">
                      <label>Manager Rate (d/mo)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={policies.managerRate}
                        onChange={e => setPolicies({ ...policies, managerRate: parseFloat(e.target.value) || 0 })}
                        className="form-input-text"
                      />
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div className="form-field">
                      <label>Senior Manager Rate (d/mo)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={policies.seniorManagerRate}
                        onChange={e => setPolicies({ ...policies, seniorManagerRate: parseFloat(e.target.value) || 0 })}
                        className="form-input-text"
                      />
                    </div>
                    <div className="form-field">
                      <label>Director Rate (d/mo)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={policies.directorRate}
                        onChange={e => setPolicies({ ...policies, directorRate: parseFloat(e.target.value) || 0 })}
                        className="form-input-text"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label>Part-Time Uniform Rate (d/mo)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={policies.partTimeRate}
                      onChange={e => setPolicies({ ...policies, partTimeRate: parseFloat(e.target.value) || 0 })}
                      className="form-input-text"
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button type="submit" className="btn btn-primary" disabled={savingPolicies}>
                      {savingPolicies ? 'Saving...' : 'Save & Apply Accrual Policies'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </main>
      </div>

      {/* ========================================================================= */}
      {/* 5. MODALS & DRAWERS                                                       */}
      {/* ========================================================================= */}
      
      {/* Persona Command Palette Modal */}
      {showPersonaModal && (
        <CommandPersonaModal
          users={users}
          selectedUserId={selectedUserId}
          onSelect={(id) => setSelectedUserId(id)}
          onClose={() => setShowPersonaModal(false)}
        />
      )}

      {/* RAG HR Policy Copilot Drawer */}
      {showCopilotDrawer && (
        <PolicyCopilotDrawer
          onClose={() => setShowCopilotDrawer(false)}
        />
      )}

      {/* Right-Side Leave Inspection Drawer */}
      {selectedLeave && (
        <LeaveDetailDrawer
          leave={selectedLeave}
          activeUser={activeUser}
          onClose={() => setSelectedLeave(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onWithdraw={handleWithdraw}
          onDownloadReport={handleDownloadReport}
        />
      )}
    </div>
  );
}
