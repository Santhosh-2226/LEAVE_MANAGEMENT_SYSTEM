import { useState, useEffect } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000';

function App() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [activeUser, setActiveUser] = useState(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [requests, setRequests] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [balance, setBalance] = useState({ accrued: 0, used: 0, available: 0 });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 1. Fetch all users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(`${API_URL}/users`);
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        setUsers(data);
        if (data.length > 0) {
          setSelectedUserId(data[0].id.toString());
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch users. Is the backend running?');
      }
    };
    fetchUsers();
  }, []);

  // 2. Sync activeUser object when selectedUserId changes
  useEffect(() => {
    if (selectedUserId && users.length > 0) {
      const found = users.find(u => u.id.toString() === selectedUserId);
      setActiveUser(found || null);
    }
  }, [selectedUserId, users]);

  // 3. Re-fetch user-specific data (requests, approvals queue, balance)
  const fetchData = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      const [requestsRes, approvalsRes, balanceRes] = await Promise.all([
        fetch(`${API_URL}/leave/requests?userId=${selectedUserId}`),
        fetch(`${API_URL}/leave/approvals?userId=${selectedUserId}`),
        fetch(`${API_URL}/leave/balance?userId=${selectedUserId}`)
      ]);

      if (!requestsRes.ok) throw new Error('Failed to load requests');
      if (!approvalsRes.ok) throw new Error('Failed to load approvals queue');
      if (!balanceRes.ok) throw new Error('Failed to load balance');

      const requestsData = await requestsRes.json();
      const approvalsData = await approvalsRes.json();
      const balanceData = await balanceRes.json();

      setRequests(requestsData);
      setApprovals(approvalsData);
      setBalance(balanceData);
    } catch (err) {
      console.error(err);
      setError('Could not retrieve user data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      setError('');
      setSuccess('');
      fetchData();
    }
  }, [selectedUserId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!startDate || !endDate) {
      setError('Please select start and end dates.');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date cannot be after end date.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/leave/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startDate, endDate, userId: parseInt(selectedUserId) }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to submit leave request');
      }

      setSuccess('Leave request submitted successfully!');
      setStartDate('');
      setEndDate('');
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id) => {
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_URL}/leave/requests/${id}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to approve request');
      }

      setSuccess('Request approved successfully!');
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = async (id) => {
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_URL}/leave/requests/${id}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to reject request');
      }

      setSuccess('Request rejected successfully.');
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-icon">👑</span>
          <h1>LMD Engine Dashboard</h1>
        </div>
        
        {/* User Switcher Dropdown */}
        <div className="user-switcher-container">
          <label htmlFor="userSelect">Active Role:</label>
          <select 
            id="userSelect"
            value={selectedUserId} 
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="user-switcher"
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.id === 1 ? 'Employee' : u.id === 2 ? 'Manager' : 'HR Admin'})
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Balance Summary Row */}
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

      {/* Approvals Queue Widget - Only render if active user has approvals pending */}
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
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Working Days</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map(appr => (
                    <tr key={appr.id} className="request-row">
                      <td>#{appr.id}</td>
                      <td className="requester-cell">👤 {appr.requesterName}</td>
                      <td>{appr.startDate ? appr.startDate.split('T')[0] : ''}</td>
                      <td>{appr.endDate ? appr.endDate.split('T')[0] : ''}</td>
                      <td className="working-days-cell">{appr.workingDays} days</td>
                      <td>
                        <div className="action-buttons-group">
                          <button 
                            onClick={() => handleApprove(appr.id)}
                            className="btn-approve"
                          >
                            Approve
                          </button>
                          <button 
                            onClick={() => handleReject(appr.id)}
                            className="btn-reject"
                          >
                            Reject
                          </button>
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
              <p className="card-subtitle">Select dates to submit request to your manager</p>
              
              <form onSubmit={handleSubmit} className="leave-form">
                <div className="form-group">
                  <label htmlFor="startDate">Start Date</label>
                  <input
                    type="date"
                    id="startDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="endDate">End Date</label>
                  <input
                    type="date"
                    id="endDate"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>

                {error && <div className="alert alert-error">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

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
              <p className="no-manager-text">
                As the top-level user/HR Admin, you do not submit leave requests here. Switch to an Employee role to request leave.
              </p>
              {error && <div className="alert alert-error">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}
            </div>
          )}
        </section>

        <section className="list-section">
          <div className="card glass-card">
            <div className="list-header">
              <h2>My Leave Requests</h2>
              <button onClick={fetchData} className="btn-secondary" disabled={loading}>
                {loading ? 'Refreshing...' : '🔄 Refresh'}
              </button>
            </div>

            {requests.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📅</span>
                <p>No leave requests found for this user.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Working Days</th>
                      <th>Status</th>
                      <th>Current Approver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((req) => (
                      <tr key={req.id} className="request-row">
                        <td>#{req.id}</td>
                        <td>{req.startDate ? req.startDate.split('T')[0] : ''}</td>
                        <td>{req.endDate ? req.endDate.split('T')[0] : ''}</td>
                        <td className="working-days-cell">{req.workingDays} days</td>
                        <td>
                          <span className={`status-pill pill-${req.status.toLowerCase()}`}>
                            {req.status === 'PENDING_TIER2' ? 'PENDING (TIER 2)' : req.status}
                          </span>
                        </td>
                        <td>
                          {req.approverName ? (
                            <span className="approver-name">👤 {req.approverName}</span>
                          ) : (
                            <span className="approver-none">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
      
      <footer className="app-footer">
        <p>LMD Engine © 2026 — PostgreSQL & Dynamic calculations engine</p>
      </footer>
    </div>
  );
}

export default App;
