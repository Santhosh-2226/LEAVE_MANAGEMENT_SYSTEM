import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

const API_URL = 'http://localhost:5000';

const REGION_FLAG = { US: '🇺🇸', IN: '🇮🇳', UK: '🇬🇧' };
const REGION_LABEL = { US: 'United States', IN: 'India', UK: 'United Kingdom' };

const LEAVE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Casual Leave',
  'Maternity / Paternity Leave',
  'Unpaid Leave',
];

function excelDateToISO(val) {
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    const mm = String(d.m).padStart(2, '0');
    const dd = String(d.d).padStart(2, '0');
    return `${d.y}-${mm}-${dd}`;
  }
  if (typeof val === 'string') {
    const clean = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const parsed = new Date(clean);
    if (!isNaN(parsed)) return parsed.toISOString().split('T')[0];
  }
  return null;
}

const REGION_COLOR = { US: '#3b82f6', IN: '#f97316', UK: '#22c55e' };

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function HolidayCalendar({ holidays, isAdmin, filterRegion, userRegion, onDelete }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const holidayMap = {};
  for (const h of holidays) {
    const iso = h.holidayDate?.split('T')[0];
    if (!iso) continue;
    if (!holidayMap[iso]) holidayMap[iso] = [];
    holidayMap[iso].push(h);
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
        <button className="cal-nav-btn" onClick={prevMonth}>&#8592;</button>
        <span className="cal-nav-title">{MONTHS[viewMonth]} {viewYear}</span>
        <button className="cal-nav-btn" onClick={nextMonth}>&#8594;</button>
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
            <div key={iso} className={`cal-cell ${isToday ? 'cal-cell-today' : ''} ${dayHolidays.length > 0 ? 'cal-cell-holiday' : ''}`}>
              <span className="cal-day-num">{day}</span>
              {dayHolidays.map((h, idx) => (
                <div key={idx} className="cal-holiday-tag" style={{ background: REGION_COLOR[h.region] || '#6366f1' }}>
                  <span className="cal-holiday-name">{h.name}</span>
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

function App() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [activeUser, setActiveUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0]);
  const [reason, setReason] = useState('');
  const [emergency, setEmergency] = useState(false);

  const [requests, setRequests] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [balance, setBalance] = useState({ accrued: 0, used: 0, available: 0 });

  const [holidays, setHolidays] = useState([]);
  const [filterRegion, setFilterRegion] = useState('ALL');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayRegion, setNewHolidayRegion] = useState('US');
  const [uploadSummary, setUploadSummary] = useState(null);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(`${API_URL}/users`);
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        setUsers(data);
        if (data.length > 0) setSelectedUserId(data[0].id.toString());
      } catch (err) {
        setError('Failed to fetch users. Is the backend running?');
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId && users.length > 0) {
      const found = users.find(u => u.id.toString() === selectedUserId);
      setActiveUser(found || null);
    }
  }, [selectedUserId, users]);

  const fetchData = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      const [reqRes, appRes, balRes] = await Promise.all([
        fetch(`${API_URL}/leave/requests?userId=${selectedUserId}`),
        fetch(`${API_URL}/leave/approvals?userId=${selectedUserId}`),
        fetch(`${API_URL}/leave/balance?userId=${selectedUserId}`),
      ]);
      if (!reqRes.ok || !appRes.ok || !balRes.ok) throw new Error('Failed to load data');
      setRequests(await reqRes.json());
      setApprovals(await appRes.json());
      setBalance(await balRes.json());
    } catch {
      setError('Could not retrieve user data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) { setError(''); setSuccess(''); fetchData(); }
  }, [selectedUserId]);

  const fetchHolidays = async (region) => {
    try {
      const url = region && region !== 'ALL'
        ? `${API_URL}/holidays?region=${region}`
        : `${API_URL}/holidays`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load holidays');
      setHolidays(await res.json());
    } catch {
      setError('Could not load holidays.');
    }
  };

  useEffect(() => {
    if (activeTab === 'holidays' && activeUser) {
      const region = activeUser.id === 3 ? filterRegion : activeUser.region;
      fetchHolidays(region);
    }
  }, [activeTab, filterRegion, activeUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!startDate || !endDate) return setError('Please select start and end dates.');
    if (new Date(startDate) > new Date(endDate)) return setError('Start date cannot be after end date.');
    if (!reason.trim()) return setError('Please enter a reason.');
    // detect past-date (end date before today)
    const today = new Date();
    const todayYmd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const eDate = new Date(endDate);
    const endYmd = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
    const isPast = endYmd < todayYmd;
    if (isPast && !emergency) return setError('Applying leave for past dates requires the Emergency checkbox to be checked.');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/leave/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, userId: parseInt(selectedUserId), leaveType, reason, emergency: isPast ? true : emergency }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to submit'); }
      setSuccess('Leave request submitted successfully!');
      setStartDate(''); setEndDate(''); setReason(''); setLeaveType(LEAVE_TYPES[0]);
      setEmergency(false);
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id) => {
    setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/leave/requests/${id}/approve`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSuccess('Request approved!');
      await fetchData();
    } catch (err) { setError(err.message); }
  };

  const handleReject = async (id) => {
    setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/leave/requests/${id}/reject`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSuccess('Request rejected.');
      await fetchData();
    } catch (err) { setError(err.message); }
  };

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!newHolidayDate || !newHolidayName.trim()) return setError('Enter both date and name.');
    try {
      const res = await fetch(`${API_URL}/holidays/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holidays: [{ region: newHolidayRegion, holiday_date: newHolidayDate, name: newHolidayName }] }),
      });
      if (!res.ok) throw new Error('Failed to add holiday');
      setSuccess(`Holiday added for ${REGION_LABEL[newHolidayRegion]}!`);
      setNewHolidayDate(''); setNewHolidayName('');
      fetchHolidays(filterRegion);
    } catch (err) { setError(err.message); }
  };

  const handleDeleteHoliday = async (id) => {
    setError(''); setSuccess('');
    try {
      const res = await fetch(`${API_URL}/holidays/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setSuccess('Holiday deleted.');
      const region = activeUser?.id === 3 ? filterRegion : activeUser?.region;
      fetchHolidays(region);
    } catch (err) { setError(err.message); }
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(''); setSuccess(''); setUploadSummary(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { raw: true });

        const parsed = [];
        const skipped = [];

        for (const r of rows) {
          const rawDate = r.date ?? r.Date ?? r.DATE;
          const rawName = r.name ?? r.Name ?? r.NAME;
          const rawRegion = r.region ?? r.Region ?? r.REGION;

          const holiday_date = excelDateToISO(rawDate);
          const name = typeof rawName === 'string' ? rawName.trim() : null;
          const region = typeof rawRegion === 'string' ? rawRegion.trim().toUpperCase() : null;

          if (!holiday_date || !name || !['US', 'IN', 'UK'].includes(region)) {
            skipped.push({ rawDate, rawName, rawRegion });
            continue;
          }
          parsed.push({ region, holiday_date, name });
        }

        if (parsed.length === 0) {
          setError(`No valid rows found. ${skipped.length} rows skipped. Check columns: date, name, region (US/IN/UK).`);
          return;
        }

        const res = await fetch(`${API_URL}/holidays/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ holidays: parsed }),
        });
        const data = await res.json();
        setUploadSummary({ inserted: data.inserted, skipped: skipped.length, total: rows.length });
        setSuccess(`✅ Uploaded ${data.inserted} holidays. ${skipped.length} rows skipped.`);
        fetchHolidays(filterRegion);
      } catch {
        setError('Failed to parse or upload Excel file. Check the file format.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const isAdmin = activeUser?.id === 3;

  const groupedHolidays = holidays.reduce((acc, h) => {
    const r = h.region;
    if (!acc[r]) acc[r] = [];
    acc[r].push(h);
    return acc;
  }, {});

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-icon">👑</span>
          <h1>LMD Engine Dashboard</h1>
        </div>
        <div className="user-switcher-container">
          <label htmlFor="userSelect">Active Role:</label>
          <select id="userSelect" value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="user-switcher">
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {REGION_FLAG[u.region] || ''} {u.name} ({u.id === 1 ? 'Employee' : u.id === 2 ? 'Manager' : 'HR Admin'})
              </option>
            ))}
          </select>
        </div>
      </header>

      {activeUser && (
        <div className="region-bar">
          <span className="region-flag">{REGION_FLAG[activeUser.region]}</span>
          <span className="region-label">{REGION_LABEL[activeUser.region]} — Holidays excluded from working day calculations</span>
          {isAdmin && <span className="admin-badge">HR Admin</span>}
        </div>
      )}

      <nav className="tab-nav">
        <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</button>
        <button className={`tab-btn ${activeTab === 'holidays' ? 'active' : ''}`} onClick={() => setActiveTab('holidays')}>
          🗓 Holidays {isAdmin ? '(Admin)' : `(${activeUser?.region || ''})`}
        </button>
      </nav>

      {activeTab === 'dashboard' && (
        <>
          <section className="balance-section">
            <div className="balance-grid">
              <div className="balance-card accrued">
                <span className="balance-label">Total Accrued</span>
                <span className="balance-value">{balance.accrued.toFixed(1)}</span>
                <span className="balance-sub">Computed live from Join Date</span>
              </div>
              <div className="balance-card used">
                <span className="balance-label">Leave Used</span>
                <span className="balance-value">{balance.used.toFixed(1)}</span>
                <span className="balance-sub">Sum of APPROVED working days</span>
              </div>
              <div className="balance-card available">
                <span className="balance-label">Available Balance</span>
                <span className="balance-value">{balance.available.toFixed(1)}</span>
                <span className="balance-sub">Accrued − Used</span>
              </div>
            </div>
          </section>

          {activeUser && (
            <section className="user-info-strip">
              <div className="user-info-card">
                <div className="user-info-avatar">{activeUser.name.charAt(0)}</div>
                <div className="user-info-details">
                  <span className="user-info-name">{activeUser.name}</span>
                  <span className="user-info-role">{activeUser.id === 1 ? 'Employee' : activeUser.id === 2 ? 'Manager' : 'HR Admin'}</span>
                </div>
                <div className="user-info-meta">
                  <div className="user-info-meta-item">
                    <span className="user-info-meta-label">Region</span>
                    <span className="user-info-meta-value">
                      {REGION_FLAG[activeUser.region]} {REGION_LABEL[activeUser.region]}
                    </span>
                  </div>
                  <div className="user-info-meta-divider" />
                  <div className="user-info-meta-item">
                    <span className="user-info-meta-label">Reports To</span>
                    <span className="user-info-meta-value">
                      {activeUser.managerId
                        ? users.find(u => u.id === activeUser.managerId)?.name || '—'
                        : <span style={{ color: '#6366f1' }}>Top Level</span>}
                    </span>
                  </div>
                  <div className="user-info-meta-divider" />
                  <div className="user-info-meta-item">
                    <span className="user-info-meta-label">Holiday Calendar</span>
                    <span className="user-info-meta-value">{REGION_FLAG[activeUser.region]} {activeUser.region} Holidays Applied</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {approvals.length > 0 && (
            <section className="approvals-queue-section">
              <div className="card glass-card approval-card">
                <div className="approval-card-header">
                  <h2>📥 Approvals Queue ({approvals.length})</h2>
                  <span className="queue-badge">Needs Decision</span>
                </div>
                <div className="table-responsive">
                  <table className="requests-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Requester</th>
                        <th>Type</th>
                        <th>Reason</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Days</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvals.map(a => (
                        <tr key={a.id} className="request-row">
                          <td>#{a.id}</td>
                          <td className="requester-cell">👤 {a.requesterName}</td>
                          <td><span className="leave-type-pill">{a.leaveType}</span></td>
                          <td className="reason-cell">{a.reason || '—'}</td>
                          <td>{a.startDate?.split('T')[0]}</td>
                          <td>{a.endDate?.split('T')[0]}</td>
                          <td className="working-days-cell">{a.workingDays} days</td>
                          <td>
                            <div className="action-buttons-group">
                              <button onClick={() => handleApprove(a.id)} className="btn-approve">Approve</button>
                              <button onClick={() => handleReject(a.id)} className="btn-reject">Reject</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          <main className="app-main">
            <section className="form-section">
              {activeUser && activeUser.managerId ? (
                <div className="card glass-card">
                  <h2>Apply for Leave</h2>
                  <p className="card-subtitle">Public holidays for your region are excluded automatically</p>
                  {error && <div className="alert alert-error">{error}</div>}
                  {success && <div className="alert alert-success">{success}</div>}
                  <form onSubmit={handleSubmit} className="leave-form">
                    <div className="form-group">
                      <label htmlFor="leaveType">Leave Type</label>
                      <select id="leaveType" value={leaveType} onChange={e => setLeaveType(e.target.value)} className="form-select">
                        {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="startDate">Start Date</label>
                      <input type="date" id="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="endDate">End Date</label>
                      <input type="date" id="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="reason">Reason</label>
                      <textarea id="reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Briefly describe the reason for leave..." rows={3} required />
                    </div>
                    {/* Past-date warning and emergency checkbox */}
                    {endDate && (() => {
                      const today = new Date();
                      const todayYmd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                      const eDate = new Date(endDate);
                      const endYmd = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
                      const isPast = endYmd < todayYmd;
                      if (isPast) {
                        return (
                          <div className="form-group">
                            <div className="alert alert-warning">The selected end date is in the past. Past-date leave is allowed only for emergencies and will be auto-approved if marked emergency.</div>
                            <label className="checkbox-row"><input type="checkbox" checked={emergency} onChange={e => setEmergency(e.target.checked)} /> Emergency (required for past-date leave)</label>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <button type="submit" className="btn-primary" disabled={submitting}>
                      {submitting ? 'Submitting...' : 'Apply Leave'}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="card glass-card no-manager-card">
                  <h2>Leave Requests</h2>
                  <p className="card-subtitle">No Manager Assigned</p>
                  <div className="no-manager-illustration">⚙️</div>
                  <p className="no-manager-text">As HR Admin, switch to an Employee role to submit leave requests.</p>
                  {error && <div className="alert alert-error">{error}</div>}
                  {success && <div className="alert alert-success">{success}</div>}
                </div>
              )}
            </section>

            <section className="list-section">
              <div className="card glass-card">
                <div className="list-header">
                  <h2>My Leave Requests</h2>
                  <button onClick={fetchData} className="btn-secondary" disabled={loading}>{loading ? 'Refreshing...' : '🔄 Refresh'}</button>
                </div>
                {requests.length === 0 ? (
                  <div className="empty-state"><span className="empty-icon">📅</span><p>No leave requests found.</p></div>
                ) : (
                  <div className="table-responsive">
                    <table className="requests-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Type</th>
                          <th>Reason</th>
                          <th>Start</th>
                          <th>End</th>
                          <th>Days</th>
                          <th>Status</th>
                          <th>Approver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map(req => (
                          <tr key={req.id} className="request-row">
                            <td>#{req.id}</td>
                            <td><span className="leave-type-pill">{req.leaveType}</span></td>
                            <td className="reason-cell">{req.reason || '—'}</td>
                            <td>{req.startDate?.split('T')[0]}</td>
                            <td>{req.endDate?.split('T')[0]}</td>
                            <td className="working-days-cell">{req.workingDays} days</td>
                            <td><span className={`status-pill pill-${req.status.toLowerCase()}`}>{req.status === 'PENDING_TIER2' ? 'PENDING (TIER 2)' : req.status}</span></td>
                            <td>{req.approverName ? <span className="approver-name">👤 {req.approverName}</span> : <span className="approver-none">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </main>
        </>
      )}

      {activeTab === 'holidays' && (
        <main className="holidays-main">
          <div className="card glass-card holiday-panel">
            <div className="holiday-panel-header">
              <div>
                <h2>🗓 {isAdmin ? 'Holiday Calendar Manager' : `${REGION_FLAG[activeUser?.region]} ${REGION_LABEL[activeUser?.region]} — Public Holidays`}</h2>
                <p className="card-subtitle">{isAdmin ? 'Manage public holidays across all regions' : 'These dates are excluded from your working day calculations'}</p>
              </div>
              {isAdmin && (
                <div className="holiday-actions">
                  <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} className="form-select region-select">
                    <option value="ALL">🌍 All Regions</option>
                    <option value="US">🇺🇸 United States</option>
                    <option value="IN">🇮🇳 India</option>
                    <option value="UK">🇬🇧 United Kingdom</option>
                  </select>
                  <button className="btn-secondary" onClick={() => fileRef.current?.click()}>📂 Upload Excel</button>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{ display: 'none' }} />
                </div>
              )}
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {isAdmin && uploadSummary && (
              <div className="upload-summary">
                <span>📊 Upload complete: <strong>{uploadSummary.inserted}</strong> inserted · <strong>{uploadSummary.skipped}</strong> skipped · <strong>{uploadSummary.total}</strong> total rows</span>
              </div>
            )}

            {isAdmin && (
              <>
                <div className="excel-hint">
                  <strong>Excel format:</strong> columns <code>date</code> (YYYY-MM-DD or Excel date) · <code>name</code> · <code>region</code> (US / IN / UK)
                </div>
                <form onSubmit={handleAddHoliday} className="add-holiday-form">
                  <select value={newHolidayRegion} onChange={e => setNewHolidayRegion(e.target.value)} className="form-select" style={{ width: 'auto', minWidth: '150px' }}>
                    <option value="US">🇺🇸 US</option>
                    <option value="IN">🇮🇳 India</option>
                    <option value="UK">🇬🇧 UK</option>
                  </select>
                  <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} required className="holiday-date-input" />
                  <input type="text" placeholder="Holiday name" value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} required className="holiday-name-input" />
                  <button type="submit" className="btn-primary">+ Add</button>
                </form>
              </>
            )}

            {isAdmin && (
              <div className="cal-legend">
                <span className="cal-legend-item"><span className="cal-dot" style={{ background: '#3b82f6' }} />🇺🇸 US</span>
                <span className="cal-legend-item"><span className="cal-dot" style={{ background: '#f97316' }} />🇮🇳 India</span>
                <span className="cal-legend-item"><span className="cal-dot" style={{ background: '#22c55e' }} />🇬🇧 UK</span>
              </div>
            )}

            <HolidayCalendar
              holidays={holidays}
              isAdmin={isAdmin}
              filterRegion={filterRegion}
              userRegion={activeUser?.region}
              onDelete={handleDeleteHoliday}
            />
          </div>
        </main>
      )}


      <footer className="app-footer">
        <p>LMD Engine © 2026 — Region-aware working days · PostgreSQL · Holiday Calendar</p>
      </footer>
    </div>
  );
}

export default App;
