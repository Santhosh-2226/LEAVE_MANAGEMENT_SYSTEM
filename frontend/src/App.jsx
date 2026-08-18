import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

const API_URL = 'http://localhost:5000';

const STANDARD_LEAVE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Casual Leave',
  'Maternity / Paternity Leave',
  'Unpaid Leave',
];

const EMERGENCY_LEAVE_TYPE = 'Emergency Leave';

const ROLES = ['Employee', 'Manager', 'Senior Manager', 'Director', 'Vice President'];
const EMPLOYMENT_TYPES = ['Full-Time', 'Part-Time'];

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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function HolidayCalendar({ holidays, isAdmin, filterRegion, onDelete }) {
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
                <div key={idx} className="cal-holiday-tag">
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

// Interactive Team Leave Calendar
function TeamLeaveCalendar({ teamLeaves, alertDates, directReports }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Map dates to leaves
  const leaveMap = {};
  for (const l of teamLeaves) {
    const s = new Date(l.startDate);
    const e = new Date(l.endDate);
    const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const fin = new Date(e.getFullYear(), e.getMonth(), e.getDate());

    while (cur <= fin) {
      if (cur.getDay() !== 0 && cur.getDay() !== 6) {
        const iso = cur.toISOString().split('T')[0];
        if (!leaveMap[iso]) leaveMap[iso] = [];
        leaveMap[iso].push(l);
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  const alertMap = {};
  for (const a of alertDates) {
    alertMap[a.date] = a;
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
    <div className="team-cal-wrapper">
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
          const dayLeaves = leaveMap[iso] || [];
          const dayAlert = alertMap[iso];
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

          return (
            <div
              key={iso}
              className={`cal-cell ${isToday ? 'cal-cell-today' : ''} ${dayAlert ? 'cal-cell-alert' : ''} ${dayLeaves.length > 0 ? 'cal-cell-has-leaves' : ''}`}
            >
              <div className="cal-cell-top">
                <span className="cal-day-num">{day}</span>
                {dayAlert && (
                  <span className="cal-alert-icon" title={`Staffing Alert: ${dayAlert.onLeaveCount}/${dayAlert.totalDirectReports} direct reports on leave`}>
                    ⚠️ {dayAlert.percentage}%
                  </span>
                )}
              </div>

              <div className="cal-leaves-list">
                {dayLeaves.map((l, idx) => (
                  <div key={idx} className={`cal-member-leave-tag ${l.status === 'PENDING' ? 'pending-leave-tag' : ''}`}>
                    <span className="leave-user-name">{l.userName}</span>
                    <span className="leave-type-micro">{l.leaveType.split(' ')[0]}</span>
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

function App() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [activeUser, setActiveUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [adminTab, setAdminTab] = useState('employees');

  // Dates first state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState(STANDARD_LEAVE_TYPES[0]);
  const [reason, setReason] = useState('');

  const [requests, setRequests] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [balance, setBalance] = useState({ accrued: 0, used: 0, available: 0, baseLeave: 10, accrualRate: 1 });

  // Team Leaves and Alert state
  const [teamData, setTeamData] = useState({ directReportsCount: 0, directReports: [], subordinates: [], teamLeaves: [], alertDates: [] });

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

  // New Employee state for Admin
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpRole, setNewEmpRole] = useState('Employee');
  const [newEmpType, setNewEmpType] = useState('Full-Time');
  const [newEmpManagerId, setNewEmpManagerId] = useState('2');
  const [newEmpJoinDate, setNewEmpJoinDate] = useState('2026-01-01');
  const [newEmpRegion, setNewEmpRegion] = useState('US');
  const [addingEmployee, setAddingEmployee] = useState(false);

  // Holidays state
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

  // Slack Integration State
  const [slackStatus, setSlackStatus] = useState({ connected: false });
  const [slackLoading, setSlackLoading] = useState(false);

  // Handle URL redirect query params from Slack OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slack') === 'connected') {
      setSuccess('✅ Slack account connected successfully! Your status will automatically update to 🏖️ On Leave during approved leaves.');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('slack_error')) {
      setError(`Slack connection failed: ${params.get('slack_error')}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Determine if past date
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
      setError('Failed to fetch users. Is backend running?');
    }
  };

  const fetchPolicies = async () => {
    try {
      const res = await fetch(`${API_URL}/policies`);
      if (res.ok) {
        const data = await res.json();
        setPolicies(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSlackStatus = async (userId) => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_URL}/api/slack/status?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setSlackStatus(data);
      }
    } catch {
      // Non-fatal
    }
  };

  const handleConnectSlack = () => {
    if (!selectedUserId) return;
    window.location.href = `${API_URL}/api/slack/oauth/authorize?userId=${selectedUserId}`;
  };

  const handleDisconnectSlack = async () => {
    if (!selectedUserId) return;
    setError(''); setSuccess('');
    setSlackLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/slack/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: parseInt(selectedUserId) })
      });
      if (!res.ok) throw new Error('Failed to disconnect Slack');
      setSuccess('Slack account disconnected.');
      await fetchSlackStatus(selectedUserId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSlackLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchPolicies();
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

  const fetchData = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      if (activeUser?.isAdmin) {
        await Promise.all([fetchUsers(), fetchPolicies(), fetchHolidays(filterRegion)]);
      } else {
        const [reqRes, appRes, balRes, teamRes] = await Promise.all([
          fetch(`${API_URL}/leave/requests?userId=${selectedUserId}`),
          fetch(`${API_URL}/leave/approvals?userId=${selectedUserId}`),
          fetch(`${API_URL}/leave/balance?userId=${selectedUserId}`),
          fetch(`${API_URL}/leave/team?managerId=${selectedUserId}`),
          fetchSlackStatus(selectedUserId)
        ]);
        if (reqRes.ok) setRequests(await reqRes.json());
        if (appRes.ok) setApprovals(await appRes.json());
        if (balRes.ok) setBalance(await balRes.json());
        if (teamRes.ok) setTeamData(await teamRes.json());
      }
    } catch {
      setError('Could not retrieve user data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      setError(''); setSuccess('');
      fetchData();
    }
  }, [selectedUserId, activeUser?.isAdmin]);

  const fetchHolidays = async (region) => {
    try {
      const url = region && region !== 'ALL'
        ? `${API_URL}/holidays?region=${region}`
        : `${API_URL}/holidays`;
      const res = await fetch(url);
      if (res.ok) setHolidays(await res.json());
    } catch {
      setError('Could not load holidays.');
    }
  };

  useEffect(() => {
    if (activeTab === 'holidays' || activeUser?.isAdmin) {
      fetchHolidays(filterRegion);
    }
  }, [activeTab, filterRegion, activeUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!startDate || !endDate) return setError('Please select start and end dates first.');
    if (new Date(startDate) > new Date(endDate)) return setError('Start date cannot be after end date.');
    if (!reason.trim()) return setError('Please enter a reason.');

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/leave/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          userId: parseInt(selectedUserId),
          leaveType: isPastDate ? EMERGENCY_LEAVE_TYPE : leaveType,
          reason,
          emergency: isPastDate
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to submit'); }
      const submitted = await res.json();
      setSuccess(
        isPastDate
          ? 'Emergency Leave submitted and automatically approved!'
          : `Leave request submitted! (Required approval tiers: ${submitted.requiredTiers})`
      );
      setStartDate(''); setEndDate(''); setReason('');
      setLeaveType(STANDARD_LEAVE_TYPES[0]);
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
      const res = await fetch(`${API_URL}/leave/requests/${id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approverId: parseInt(selectedUserId) })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const updated = await res.json();
      if (updated.status === 'APPROVED') {
        setSuccess('Leave request received final approval!');
      } else {
        setSuccess(`Approved! Request advanced to next approval tier (Tier ${updated.currentTier} of ${updated.requiredTiers}).`);
      }
      await fetchData();
    } catch (err) { setError(err.message); }
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
      setSuccess('Request rejected.');
      await fetchData();
    } catch (err) { setError(err.message); }
  };

  // Manager Availability & Substitution Save
  const handleSaveAvailability = async () => {
    setError(''); setSuccess('');
    setUpdatingAvailability(true);
    try {
      const res = await fetch(`${API_URL}/users/${selectedUserId}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availabilityStatus,
          delegateId: availabilityStatus === 'UN_AVL' ? delegateId : null
        })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSuccess(
        availabilityStatus === 'UN_AVL'
          ? `Status set to Unavailable (UN_AVL). Delegated to ${users.find(u => u.id.toString() === delegateId)?.name || 'substitute'}.`
          : 'Status set to Available (AVL).'
      );
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingAvailability(false);
    }
  };

  // Admin: Save Policies
  const handleSavePolicies = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setSavingPolicies(true);
    try {
      const res = await fetch(`${API_URL}/policies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policies)
      });
      if (!res.ok) throw new Error('Failed to update policies');
      const data = await res.json();
      setPolicies(data.policies);
      setSuccess('✅ Corporate accrual policies updated! Changes applied in real time to all employees.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPolicies(false);
    }
  };

  // Admin: Add Employee
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!newEmpName.trim()) return setError('Enter employee name.');
    setAddingEmployee(true);
    try {
      const res = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newEmpName.trim(),
          role: newEmpRole,
          employmentType: newEmpType,
          managerId: newEmpRole === 'Vice President' ? null : newEmpManagerId,
          joinDate: newEmpJoinDate,
          region: newEmpRegion
        })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const newU = await res.json();
      setSuccess(`Employee ${newU.name} (${newU.role}, ${newU.employmentType}) added successfully!`);
      setNewEmpName('');
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingEmployee(false);
    }
  };

  // Holidays handlers
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
      setSuccess(`Holiday added!`);
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
      fetchHolidays(filterRegion);
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
          setError(`No valid rows found. ${skipped.length} rows skipped. Check columns: date, name, region.`);
          return;
        }

        const res = await fetch(`${API_URL}/holidays/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ holidays: parsed }),
        });
        const data = await res.json();
        setUploadSummary({ inserted: data.inserted, skipped: skipped.length, total: rows.length });
        setSuccess(`Uploaded ${data.inserted} holidays.`);
        fetchHolidays(filterRegion);
      } catch {
        setError('Failed to parse or upload Excel file.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const estimateDaysAndTiers = () => {
    if (!startDate || !endDate || new Date(startDate) > new Date(endDate)) return null;
    const s = new Date(startDate);
    const e = new Date(endDate);
    let count = 0;
    const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const fin = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    while (cur <= fin) {
      const d = cur.getDay();
      if (d !== 0 && d !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }

    if (isPastDate) {
      return { days: count, description: 'Past Date Emergency: Auto-approved upon submission.' };
    }

    if (count < 3) {
      return { days: count, description: `Approx. ${count} days (< 3 days): Requires 1 Level Approval (+1 tier)` };
    } else if (count <= 7) {
      return { days: count, description: `Approx. ${count} days (3 to 7 days): Requires 2 Levels Sequential Approval (+2 tiers)` };
    } else {
      return { days: count, description: `Approx. ${count} days (> 1 week): Requires Multi-Tier Approval from ALL higher levels up to Vice President` };
    }
  };

  const approvalPreview = estimateDaysAndTiers();
  const isManagerOrAbove = activeUser && ['Manager', 'Senior Manager', 'Director', 'Vice President'].includes(activeUser.role);
  const potentialDelegates = users.filter(u => !u.isAdmin && u.id !== activeUser?.id);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-icon">🏢</span>
          <div className="logo-text">
            <h1>Leave Flow Enterprise</h1>
            <p className="logo-subtitle">Multi-Tier Approvals · Dynamic Corporate Policies · Delegation</p>
          </div>
        </div>

        <div className="user-switcher-container">
          <label htmlFor="userSelect">Active Account / Persona:</label>
          <select
            id="userSelect"
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="user-switcher"
          >
            <optgroup label="⚙️ Administrative Portal">
              {users.filter(u => u.isAdmin).map(u => (
                <option key={u.id} value={u.id}>
                  ⭐ {u.name} (HR Admin Console)
                </option>
              ))}
            </optgroup>
            <optgroup label="👥 Corporate Job Hierarchy">
              {users.filter(u => !u.isAdmin).map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.role} ({u.employmentType}) {u.availabilityStatus === 'UN_AVL' ? '[🔴 UN_AVL]' : ''}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </header>

      {/* Profile / Role Banner */}
      {activeUser && (
        <div className="user-role-strip">
          <div className="user-role-info">
            <span className={`role-pill-main ${activeUser.isAdmin ? 'admin-pill' : ''}`}>
              {activeUser.isAdmin ? 'System Admin' : activeUser.role}
            </span>
            <span className="user-name-main">{activeUser.name}</span>
            {!activeUser.isAdmin && (
              <span className={`emp-type-badge ${activeUser.employmentType === 'Part-Time' ? 'part-time-badge' : ''}`}>
                {activeUser.employmentType}
              </span>
            )}
            {!activeUser.isAdmin && (
              <span className={`avail-status-tag ${activeUser.availabilityStatus === 'UN_AVL' ? 'unavl-tag' : 'avl-tag'}`}>
                {activeUser.availabilityStatus === 'UN_AVL' ? '🔴 Unavailable (UN_AVL)' : '🟢 Available (AVL)'}
              </span>
            )}
          </div>

          <div className="user-role-hierarchy">
            {activeUser.isAdmin ? (
              <span className="admin-status-text">Full Administrator Privileges — Real-Time Policy & Staff Management</span>
            ) : (
              <>
                <span className="hierarchy-label">Reports To:</span>
                <span className="hierarchy-value">
                  {activeUser.managerName
                    ? `${activeUser.managerName} (${activeUser.managerRole})`
                    : 'Top Executive (Vice President)'}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Global Alerts */}
      {error && <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>{success}</div>}

      {/* 50% Concurrency Staffing Alert Banner for Managers */}
      {!activeUser?.isAdmin && teamData.alertDates && teamData.alertDates.length > 0 && (
        <div className="staffing-alert-banner">
          <div className="alert-banner-header">
            <span className="alert-banner-icon">⚠️</span>
            <strong>Staffing Alert: High Leave Concurrency Detected ($\ge 50\%$ Direct Reports)</strong>
          </div>
          <div className="alert-dates-pills">
            {teamData.alertDates.map(a => (
              <div key={a.date} className="alert-date-chip">
                <strong>{a.date}</strong>: {a.onLeaveCount} of {a.totalDirectReports} direct reports ({a.percentage}%) on leave — <em>{a.employeeNames.join(', ')}</em>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. ADMIN DASHBOARD VIEW (When Active User is System Admin)                 */}
      {/* ========================================================================= */}
      {activeUser?.isAdmin ? (
        <div className="admin-dashboard">
          <nav className="tab-nav">
            <button className={`tab-btn ${adminTab === 'employees' ? 'active' : ''}`} onClick={() => setAdminTab('employees')}>
              👥 Employee Directory & Hiring
            </button>
            <button className={`tab-btn ${adminTab === 'policies' ? 'active' : ''}`} onClick={() => setAdminTab('policies')}>
              📜 Corporate Accrual Policies
            </button>
            <button className={`tab-btn ${adminTab === 'holidays' ? 'active' : ''}`} onClick={() => setAdminTab('holidays')}>
              🗓 Holiday Calendar Manager
            </button>
          </nav>

          {/* Sub-Tab 1: Employee Management */}
          {adminTab === 'employees' && (
            <main className="admin-content-grid">
              {/* Add Employee Card */}
              <section className="card glass-card">
                <h2>Add New Employee</h2>
                <p className="card-subtitle">Register a new hire into the corporate hierarchy</p>
                <form onSubmit={handleAddEmployee} className="leave-form">
                  <div className="form-group">
                    <label>Full Name <span className="req-star">*</span></label>
                    <input
                      type="text"
                      placeholder="e.g. Johnathan Miller"
                      value={newEmpName}
                      onChange={e => setNewEmpName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Job Role</label>
                      <select value={newEmpRole} onChange={e => setNewEmpRole(e.target.value)} className="form-select">
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Employment Type</label>
                      <select value={newEmpType} onChange={e => setNewEmpType(e.target.value)} className="form-select">
                        {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    {newEmpRole !== 'Vice President' && (
                      <div className="form-group">
                        <label>Reports To (Manager)</label>
                        <select value={newEmpManagerId} onChange={e => setNewEmpManagerId(e.target.value)} className="form-select">
                          {users.filter(u => !u.isAdmin).map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Join Date</label>
                      <input
                        type="date"
                        value={newEmpJoinDate}
                        onChange={e => setNewEmpJoinDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn-primary" disabled={addingEmployee}>
                    {addingEmployee ? 'Creating Employee...' : '+ Create Employee'}
                  </button>
                </form>
              </section>

              {/* Employee Directory */}
              <section className="card glass-card">
                <h2>Corporate Employee Directory</h2>
                <p className="card-subtitle">Manage roles, employment types, and reporting structures</p>
                <div className="table-responsive">
                  <table className="requests-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Type</th>
                        <th>Reports To</th>
                        <th>Availability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.filter(u => !u.isAdmin).map(u => (
                        <tr key={u.id}>
                          <td>#{u.id}</td>
                          <td><strong>{u.name}</strong></td>
                          <td><span className="role-tag">{u.role}</span></td>
                          <td>
                            <span className={`emp-type-badge ${u.employmentType === 'Part-Time' ? 'part-time-badge' : ''}`}>
                              {u.employmentType}
                            </span>
                          </td>
                          <td>{u.managerName ? `${u.managerName} (${u.managerRole})` : 'Top Level (VP)'}</td>
                          <td>
                            <span className={`avail-status-tag ${u.availabilityStatus === 'UN_AVL' ? 'unavl-tag' : 'avl-tag'}`}>
                              {u.availabilityStatus === 'UN_AVL'
                                ? `UN_AVL (Delegate: ${u.delegateName || 'None'})`
                                : 'AVL (Active)'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </main>
          )}

          {/* Sub-Tab 2: Corporate Accrual Policies */}
          {adminTab === 'policies' && (
            <main className="admin-policy-view">
              <div className="card glass-card policy-card">
                <div className="policy-header">
                  <div>
                    <h2>Corporate Leave & Accrual Policies</h2>
                    <p className="card-subtitle">Modify real-time baseline entitlements and monthly role rates across the organization</p>
                  </div>
                  <span className="live-policy-badge">⚡ Real-Time Engine Active</span>
                </div>

                <form onSubmit={handleSavePolicies} className="policy-form">
                  <div className="policy-section-box">
                    <h3>1. Base Leave Entitlement (All Employees)</h3>
                    <p className="policy-subtext">Initial starting leave balance provided to every employee upon joining.</p>
                    <div className="policy-input-row">
                      <label>Base Leave Quota (days):</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={policies.baseLeave}
                        onChange={e => setPolicies({ ...policies, baseLeave: parseFloat(e.target.value) || 0 })}
                        required
                        className="policy-num-input"
                      />
                    </div>
                  </div>

                  <div className="policy-section-box">
                    <h3>2. Full-Time Monthly Accrual Rates (By Hierarchy Role)</h3>
                    <p className="policy-subtext">Days accrued each month if no approved leave was taken during that month.</p>
                    <div className="policy-grid-inputs">
                      <div className="policy-grid-item">
                        <label>Employee (Level 1):</label>
                        <div className="input-with-unit">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={policies.employeeRate}
                            onChange={e => setPolicies({ ...policies, employeeRate: parseFloat(e.target.value) || 0 })}
                            required
                          />
                          <span>days/mo</span>
                        </div>
                      </div>

                      <div className="policy-grid-item">
                        <label>Manager (Level 2):</label>
                        <div className="input-with-unit">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={policies.managerRate}
                            onChange={e => setPolicies({ ...policies, managerRate: parseFloat(e.target.value) || 0 })}
                            required
                          />
                          <span>days/mo</span>
                        </div>
                      </div>

                      <div className="policy-grid-item">
                        <label>Senior Manager (Level 3):</label>
                        <div className="input-with-unit">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={policies.seniorManagerRate}
                            onChange={e => setPolicies({ ...policies, seniorManagerRate: parseFloat(e.target.value) || 0 })}
                            required
                          />
                          <span>days/mo</span>
                        </div>
                      </div>

                      <div className="policy-grid-item">
                        <label>Director (Level 4):</label>
                        <div className="input-with-unit">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={policies.directorRate}
                            onChange={e => setPolicies({ ...policies, directorRate: parseFloat(e.target.value) || 0 })}
                            required
                          />
                          <span>days/mo</span>
                        </div>
                      </div>

                      <div className="policy-grid-item">
                        <label>Vice President (Level 5):</label>
                        <div className="input-with-unit">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={policies.vpRate}
                            onChange={e => setPolicies({ ...policies, vpRate: parseFloat(e.target.value) || 0 })}
                            required
                          />
                          <span>days/mo</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="policy-section-box">
                    <h3>3. Part-Time Uniform Accrual Rate</h3>
                    <p className="policy-subtext">Uniform rate applied to all Part-Time employees regardless of job level.</p>
                    <div className="policy-input-row">
                      <label>Part-Time Accrual Rate:</label>
                      <div className="input-with-unit">
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={policies.partTimeRate}
                          onChange={e => setPolicies({ ...policies, partTimeRate: parseFloat(e.target.value) || 0 })}
                          required
                          className="policy-num-input"
                        />
                        <span>days/mo</span>
                      </div>
                    </div>
                  </div>

                  <div className="policy-actions">
                    <button type="submit" className="btn-primary btn-large" disabled={savingPolicies}>
                      {savingPolicies ? 'Updating Corporate Policies...' : '💾 Save & Apply Policies Organization-Wide'}
                    </button>
                  </div>
                </form>
              </div>
            </main>
          )}

          {/* Sub-Tab 3: Holidays */}
          {adminTab === 'holidays' && (
            <main className="holidays-main">
              <div className="card glass-card holiday-panel">
                <div className="holiday-panel-header">
                  <div>
                    <h2>🗓 Holiday Calendar Manager</h2>
                    <p className="card-subtitle">Manage corporate holidays across regions</p>
                  </div>
                  <div className="holiday-actions">
                    <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} className="form-select region-select">
                      <option value="ALL">All Regions</option>
                      <option value="US">Region US</option>
                      <option value="IN">Region IN</option>
                      <option value="UK">Region UK</option>
                    </select>
                    <button className="btn-secondary" onClick={() => fileRef.current?.click()}>📂 Upload Excel</button>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{ display: 'none' }} />
                  </div>
                </div>

                <form onSubmit={handleAddHoliday} className="add-holiday-form">
                  <select value={newHolidayRegion} onChange={e => setNewHolidayRegion(e.target.value)} className="form-select" style={{ minWidth: '120px' }}>
                    <option value="US">US</option>
                    <option value="IN">IN</option>
                    <option value="UK">UK</option>
                  </select>
                  <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} required className="holiday-date-input" />
                  <input type="text" placeholder="Holiday name" value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} required className="holiday-name-input" />
                  <button type="submit" className="btn-primary">+ Add Holiday</button>
                </form>

                <HolidayCalendar holidays={holidays} isAdmin={true} filterRegion={filterRegion} onDelete={handleDeleteHoliday} />
              </div>
            </main>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* 2. CORPORATE EMPLOYEE / MANAGER DASHBOARD                                 */
        /* ========================================================================= */
        <>
          <nav className="tab-nav">
            <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
              📊 Leave Dashboard
            </button>
            {isManagerOrAbove && (
              <button className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`} onClick={() => setActiveTab('team')}>
                👥 Team Calendar {teamData.alertDates?.length > 0 ? `(⚠️ ${teamData.alertDates.length} Alerts)` : ''}
              </button>
            )}
            <button className={`tab-btn ${activeTab === 'holidays' ? 'active' : ''}`} onClick={() => setActiveTab('holidays')}>
              🗓 Public Holidays
            </button>
          </nav>

          {activeTab === 'dashboard' && (
            <>
              {/* Balances Section */}
              <section className="balance-section">
                <div className="balance-grid balance-grid-4">
                  <div className="balance-card base-quota">
                    <span className="balance-label">Base Allowance</span>
                    <span className="balance-value">{balance.baseLeave !== undefined ? balance.baseLeave.toFixed(1) : '10.0'} <span className="unit-small">days</span></span>
                    <span className="balance-sub">
                      {activeUser?.employmentType === 'Part-Time' ? 'Part-Time Rate' : 'Role Rate'}: +{balance.accrualRate || 1}d/mo if no leave
                    </span>
                  </div>
                  <div className="balance-card accrued">
                    <span className="balance-label">Total Accrued</span>
                    <span className="balance-value">{balance.accrued.toFixed(1)} <span className="unit-small">days</span></span>
                    <span className="balance-sub">10 Base + {balance.accruedFromMonths || 0}d ({balance.monthsWithNoLeave || 0} leave-free mos)</span>
                  </div>
                  <div className="balance-card used">
                    <span className="balance-label">Leave Used</span>
                    <span className="balance-value">{balance.used.toFixed(1)} <span className="unit-small">days</span></span>
                    <span className="balance-sub">Sum of Approved Days ({balance.monthsWithLeave || 0} mos with leave)</span>
                  </div>
                  <div className="balance-card available">
                    <span className="balance-label">Available Balance</span>
                    <span className="balance-value">{balance.available.toFixed(1)} <span className="unit-small">days</span></span>
                    <span className="balance-sub">Total Accrued − Used</span>
                  </div>
                </div>
              </section>

              {/* Manager Availability & Delegation Bar (If Manager or above) */}
              {isManagerOrAbove && (
                <section className="manager-delegation-strip card glass-card">
                  <div className="delegation-header-info">
                    <span className="delegation-title">🛡️ Manager Availability & Substitution</span>
                    <span className="delegation-desc">Mark yourself unavailable when on leave and designate a substitute approver</span>
                  </div>

                  <div className="delegation-controls">
                    <div className="toggle-group">
                      <button
                        type="button"
                        className={`toggle-btn ${availabilityStatus === 'AVL' ? 'active-avl' : ''}`}
                        onClick={() => setAvailabilityStatus('AVL')}
                      >
                        🟢 Available (AVL)
                      </button>
                      <button
                        type="button"
                        className={`toggle-btn ${availabilityStatus === 'UN_AVL' ? 'active-unavl' : ''}`}
                        onClick={() => setAvailabilityStatus('UN_AVL')}
                      >
                        🔴 Unavailable (UN_AVL)
                      </button>
                    </div>

                    {availabilityStatus === 'UN_AVL' && (
                      <div className="delegate-select-wrap">
                        <label>Designated Substitute:</label>
                        <select
                          value={delegateId}
                          onChange={e => setDelegateId(e.target.value)}
                          className="form-select delegate-select"
                        >
                          <option value="">-- Choose Delegate --</option>
                          {potentialDelegates.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button
                      onClick={handleSaveAvailability}
                      className="btn-primary btn-sm"
                      disabled={updatingAvailability}
                    >
                      {updatingAvailability ? 'Saving...' : 'Save Availability'}
                    </button>
                  </div>
                </section>
              )}

              {/* Slack Integration Card */}
              <section className="slack-integration-strip card glass-card">
                <div className="slack-header-info">
                  <div className="slack-title-row">
                    <span className="slack-icon-badge">💬</span>
                    <span className="slack-title">Slack Integration</span>
                    <span className={`slack-status-pill ${slackStatus.connected ? 'slack-connected' : 'slack-disconnected'}`}>
                      {slackStatus.connected ? '🟢 Connected' : '⚪ Not Connected'}
                    </span>
                  </div>
                  <span className="slack-desc">
                    {slackStatus.connected
                      ? `Connected as Slack user: @${slackStatus.slackUser?.name || slackStatus.slackUser?.id} ${slackStatus.slackUser?.teamId ? `(${slackStatus.slackUser.teamId})` : ''}. Your status will automatically update to 🏖️ On Leave during approved leaves.`
                      : 'Connect your Slack account to automatically update your Slack custom status to 🏖️ On Leave when your leaves are approved.'}
                  </span>
                </div>

                <div className="slack-actions">
                  {slackStatus.connected ? (
                    <button
                      onClick={handleDisconnectSlack}
                      className="btn-secondary btn-disconnect"
                      disabled={slackLoading}
                    >
                      {slackLoading ? 'Disconnecting...' : '🔌 Disconnect Slack'}
                    </button>
                  ) : (
                    <button
                      onClick={handleConnectSlack}
                      className="btn-primary btn-slack-connect"
                    >
                      🔗 Connect Slack
                    </button>
                  )}
                </div>
              </section>

              {/* Approvals Queue */}
              {approvals.length > 0 && (
                <section className="approvals-queue-section">
                  <div className="card glass-card approval-card">
                    <div className="approval-card-header">
                      <div className="queue-title-wrap">
                        <h2>📥 Pending Approvals Queue ({approvals.length})</h2>
                        <p className="card-subtitle">Leave requests waiting for your managerial review</p>
                      </div>
                      <span className="queue-badge">Action Required</span>
                    </div>
                    <div className="table-responsive">
                      <table className="requests-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Requester</th>
                            <th>Tier Progress</th>
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
                              <td className="requester-cell">
                                <strong>{a.requesterName}</strong>
                                <span className="role-tag" style={{ marginLeft: '6px' }}>{a.requesterRole}</span>
                                {a.delegatingFor && (
                                  <div className="delegated-tag">
                                    Acting on behalf of: <strong>{a.delegatingFor}</strong>
                                  </div>
                                )}
                              </td>
                              <td>
                                <span className="tier-badge">
                                  Tier {a.currentTier} of {a.requiredTiers}
                                </span>
                              </td>
                              <td><span className="leave-type-pill">{a.leaveType}</span></td>
                              <td className="reason-cell">{a.reason || '—'}</td>
                              <td>{a.startDate?.split('T')[0]}</td>
                              <td>{a.endDate?.split('T')[0]}</td>
                              <td className="working-days-cell">{a.workingDays}d</td>
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
                {/* Apply Leave Section - Dates First */}
                <section className="form-section">
                  <div className="card glass-card">
                    <h2>Apply for Leave</h2>
                    <p className="card-subtitle">Select date range first to determine leave options and approval workflow</p>

                    <form onSubmit={handleSubmit} className="leave-form">
                      <div className="form-row">
                        <div className="form-group">
                          <label htmlFor="startDate">Start Date <span className="req-star">*</span></label>
                          <input
                            type="date"
                            id="startDate"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="endDate">End Date <span className="req-star">*</span></label>
                          <input
                            type="date"
                            id="endDate"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      {isPastDate && (
                        <div className="alert alert-warning">
                          ⚡ <strong>Past Date Detected:</strong> Only <strong>Emergency Leave</strong> is permitted for past-date submissions.
                        </div>
                      )}

                      {approvalPreview && (
                        <div className="approval-preview-box">
                          <span className="preview-icon">ℹ️</span>
                          <span className="preview-text">{approvalPreview.description}</span>
                        </div>
                      )}

                      <div className="form-group">
                        <label htmlFor="leaveType">
                          Leave Type <span className="req-star">*</span>
                          {isPastDate && <span className="field-hint"> (Locked to Emergency Leave)</span>}
                        </label>
                        <select
                          id="leaveType"
                          value={leaveType}
                          onChange={e => setLeaveType(e.target.value)}
                          className="form-select"
                          disabled={isPastDate}
                        >
                          {availableLeaveTypes.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="reason">
                          Reason <span className="req-star">*</span>
                        </label>
                        <textarea
                          id="reason"
                          value={reason}
                          onChange={e => setReason(e.target.value)}
                          placeholder={isPastDate ? "Explain emergency circumstance..." : "Briefly describe reason for leave..."}
                          rows={3}
                          required
                        />
                      </div>

                      <button type="submit" className="btn-primary" disabled={submitting}>
                        {submitting ? 'Submitting...' : (isPastDate ? 'Submit Emergency Leave' : 'Submit Leave Request')}
                      </button>
                    </form>
                  </div>
                </section>

                {/* My Leave Requests Section */}
                <section className="list-section">
                  <div className="card glass-card">
                    <div className="list-header">
                      <div>
                        <h2>My Leave Requests</h2>
                        <p className="card-subtitle">Tracking approval statuses and approver details</p>
                      </div>
                      <button onClick={fetchData} className="btn-secondary" disabled={loading}>
                        {loading ? 'Refreshing...' : '🔄 Refresh'}
                      </button>
                    </div>

                    {requests.length === 0 ? (
                      <div className="empty-state">
                        <span className="empty-icon">📅</span>
                        <p>No leave requests found for {activeUser?.name}.</p>
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="requests-table">
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>Type</th>
                              <th>Reason</th>
                              <th>Dates</th>
                              <th>Days</th>
                              <th>Status</th>
                              <th>Approver Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {requests.map(req => {
                              const isApproved = req.status === 'APPROVED';
                              const isRejected = req.status === 'REJECTED';
                              const isPending = req.status === 'PENDING';

                              return (
                                <tr key={req.id} className="request-row">
                                  <td>#{req.id}</td>
                                  <td><span className="leave-type-pill">{req.leaveType}</span></td>
                                  <td className="reason-cell">{req.reason || '—'}</td>
                                  <td>
                                    <div className="date-range-display">
                                      <span>{req.startDate?.split('T')[0]}</span>
                                      <span className="date-sep">→</span>
                                      <span>{req.endDate?.split('T')[0]}</span>
                                    </div>
                                  </td>
                                  <td className="working-days-cell">{req.workingDays}d</td>
                                  <td>
                                    <span className={`status-pill pill-${req.status.toLowerCase()}`}>
                                      {req.status}
                                    </span>
                                  </td>
                                  <td className="approver-cell">
                                    {isApproved && (
                                      <div className="approver-status-box approved-box">
                                        <span className="approver-icon">✅</span>
                                        <span className="approver-text">
                                          {req.decidedBy || 'Approved'}
                                        </span>
                                      </div>
                                    )}

                                    {isRejected && (
                                      <div className="approver-status-box rejected-box">
                                        <span className="approver-icon">❌</span>
                                        <span className="approver-text">
                                          {req.decidedBy || 'Rejected'}
                                        </span>
                                      </div>
                                    )}

                                    {isPending && (
                                      <div className="approver-status-box pending-box">
                                        <span className="approver-icon">⏳</span>
                                        <span className="approver-text">
                                          {req.approverName
                                            ? `Awaiting ${req.approverName} (${req.approverRole || 'Manager'})`
                                            : 'Awaiting Approver'}
                                          {req.delegateName && (
                                            <span className="delegate-info"> (Substitute: {req.delegateName})</span>
                                          )}
                                        </span>
                                        <span className="tier-tag-small">
                                          Tier {req.currentTier} of {req.requiredTiers}
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>
              </main>
            </>
          )}

          {/* Team Leave Calendar Tab */}
          {activeTab === 'team' && isManagerOrAbove && (
            <main className="team-calendar-section">
              <div className="card glass-card">
                <div className="team-cal-header">
                  <div>
                    <h2>👥 Team Leave Calendar & Mentees Overview</h2>
                    <p className="card-subtitle">
                      Tracking approved & pending leaves for your {teamData.directReportsCount} direct reports and {teamData.subordinates?.length} total organization reports
                    </p>
                  </div>
                  <div className="team-stats-pills">
                    <span className="stat-chip">Direct Reports: <strong>{teamData.directReportsCount}</strong></span>
                    <span className="stat-chip">Total Subordinates: <strong>{teamData.subordinates?.length}</strong></span>
                  </div>
                </div>

                <TeamLeaveCalendar
                  teamLeaves={teamData.teamLeaves || []}
                  alertDates={teamData.alertDates || []}
                  directReports={teamData.directReports || []}
                />
              </div>
            </main>
          )}

          {/* Public Holidays Tab */}
          {activeTab === 'holidays' && (
            <main className="holidays-main">
              <div className="card glass-card holiday-panel">
                <div className="holiday-panel-header">
                  <div>
                    <h2>🗓 Public Holiday Calendar</h2>
                    <p className="card-subtitle">Dates excluded from working day calculations</p>
                  </div>
                </div>
                <HolidayCalendar holidays={holidays} isAdmin={false} filterRegion="ALL" />
              </div>
            </main>
          )}
        </>
      )}

      <footer className="app-footer">
        <p>Leave Flow Enterprise © 2026 — Multi-Tier Role Hierarchy · Delegation · Real-Time Policy Management</p>
      </footer>
    </div>
  );
}

export default App;
