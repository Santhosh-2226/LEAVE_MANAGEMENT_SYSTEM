import { pool } from '../../../db/pool.js';
import { decryptSlackToken } from '../utils/slackTokenEncryption.js';
import { getUserProfile, setUserProfile } from './slackApiService.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDateYmd(d) {
  if (typeof d === 'string') {
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10) - 1,
        day: parseInt(match[3], 10),
        iso: `${match[1]}-${match[2]}-${match[3]}`
      };
    }
  }
  const dt = d instanceof Date ? d : new Date(d);
  const year = dt.getFullYear();
  const month = dt.getMonth();
  const day = dt.getDate();
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return {
    year,
    month,
    day,
    iso: `${year}-${mm}-${dd}`
  };
}

/**
 * Formats dynamic Slack custom status text and emoji based on all approved leaves for a user
 * - Removes past dates
 * - If today is leave: says "Today I'm on leave" + any remaining dates
 * - If today is working day: says "Upcoming leave: [Dates]"
 * - If no leaves: clears status
 * @param {Array} approvedLeaves 
 * @param {Date} referenceDate 
 * @returns {{ statusText: string, statusEmoji: string, shouldClear: boolean }}
 */
export function computeUserSlackStatus(approvedLeaves = [], referenceDate = new Date()) {
  const ref = parseDateYmd(referenceDate);
  const todayIso = ref.iso;

  // Filter approved leaves that end today or in the future
  const relevantLeaves = (approvedLeaves || [])
    .filter(l => l.status === 'APPROVED' && parseDateYmd(l.endDate || l.end_date).iso >= todayIso)
    .sort((a, b) => parseDateYmd(a.startDate || a.start_date).iso.localeCompare(parseDateYmd(b.startDate || b.start_date).iso));

  if (relevantLeaves.length === 0) {
    return { statusText: '', statusEmoji: '', shouldClear: true };
  }

  // 1. Check if today is active inside any approved leave
  const activeLeave = relevantLeaves.find(l => {
    const sIso = parseDateYmd(l.startDate || l.start_date).iso;
    const eIso = parseDateYmd(l.endDate || l.end_date).iso;
    return todayIso >= sIso && todayIso <= eIso;
  });

  const futureLeaves = relevantLeaves.filter(l => parseDateYmd(l.startDate || l.start_date).iso > todayIso);

  if (activeLeave) {
    // Today is an active leave date!
    const s = parseDateYmd(activeLeave.startDate || activeLeave.start_date);
    const e = parseDateYmd(activeLeave.endDate || activeLeave.end_date);
    const isLastDay = todayIso === e.iso;
    const isSingleDay = s.iso === e.iso;

    let statusText = "Today I'm on leave";

    if (!isLastDay && !isSingleDay) {
      // There are remaining days in this active leave (future dates, past removed)
      statusText = `Today I'm on leave & also on leave until ${MONTH_NAMES[e.month]} ${e.day}`;
    }

    // If there's an upcoming subsequent leave and string fits within 95 chars, append it
    if (futureLeaves.length > 0) {
      const nextL = futureLeaves[0];
      const nextS = parseDateYmd(nextL.startDate || nextL.start_date);
      const nextE = parseDateYmd(nextL.endDate || nextL.end_date);
      const nextStr = nextS.iso === nextE.iso
        ? `${MONTH_NAMES[nextS.month]} ${nextS.day}`
        : `${MONTH_NAMES[nextS.month]} ${nextS.day}-${nextE.day}`;

      if (statusText.length + nextStr.length + 15 <= 95) {
        statusText += ` (Next: ${nextStr})`;
      }
    }

    let statusEmoji = ':beach_with_umbrella:';
    const lType = (activeLeave.leaveType || activeLeave.leave_type || '').toLowerCase();
    if (lType.includes('sick')) statusEmoji = ':face_with_thermometer:';
    else if (lType.includes('casual')) statusEmoji = ':palm_tree:';
    else if (lType.includes('emergency')) statusEmoji = ':warning:';

    return { statusText, statusEmoji, shouldClear: false };
  }

  // 2. Today is NOT a leave day (working day), but user has future approved leaves
  if (futureLeaves.length > 0) {
    const nextL = futureLeaves[0];
    const nextS = parseDateYmd(nextL.startDate || nextL.start_date);
    const nextE = parseDateYmd(nextL.endDate || nextL.end_date);

    let statusText = '';
    if (nextS.iso === nextE.iso) {
      statusText = `Upcoming leave: ${MONTH_NAMES[nextS.month]} ${nextS.day}`;
    } else if (nextS.month === nextE.month) {
      statusText = `Upcoming leave: ${MONTH_NAMES[nextS.month]} ${nextS.day} - ${nextE.day}`;
    } else {
      statusText = `Upcoming leave: ${MONTH_NAMES[nextS.month]} ${nextS.day} - ${MONTH_NAMES[nextE.month]} ${nextE.day}`;
    }

    let statusEmoji = ':calendar:';
    const lType = (nextL.leaveType || nextL.leave_type || '').toLowerCase();
    if (lType.includes('sick')) statusEmoji = ':face_with_thermometer:';
    else if (lType.includes('casual')) statusEmoji = ':palm_tree:';
    else if (lType.includes('emergency')) statusEmoji = ':warning:';

    return { statusText, statusEmoji, shouldClear: false };
  }

  return { statusText: '', statusEmoji: '', shouldClear: true };
}

export function formatLeaveSlackStatus(startDateStr, endDateStr, leaveType = 'Annual Leave', referenceDate = new Date()) {
  return computeUserSlackStatus([{ startDate: startDateStr, endDate: endDateStr, leaveType, status: 'APPROVED' }], referenceDate);
}

/**
 * Creates persistent database-backed START_LEAVE and END_LEAVE jobs when leave is approved
 * and immediately updates Slack status
 * @param {number} leaveId 
 * @param {number} userId 
 * @param {string|Date} startDateStr 
 * @param {string|Date} endDateStr 
 * @param {string} leaveType 
 */
export async function scheduleSlackStatusJobs(leaveId, userId, startDateStr, endDateStr, leaveType = 'Annual Leave') {
  try {
    const { statusText, statusEmoji } = formatLeaveSlackStatus(startDateStr, endDateStr, leaveType);

    const sDate = new Date(startDateStr);
    const eDate = new Date(endDateStr);

    const startScheduledAt = new Date(Date.UTC(sDate.getUTCFullYear(), sDate.getUTCMonth(), sDate.getUTCDate(), 0, 0, 0));
    const endScheduledAt = new Date(Date.UTC(eDate.getUTCFullYear(), eDate.getUTCMonth(), eDate.getUTCDate(), 23, 59, 59));

    const now = new Date();
    const effectiveStartScheduled = startScheduledAt <= now ? now : startScheduledAt;

    // 1. Insert or update START_LEAVE job
    await pool.query(
      `INSERT INTO slack_status_jobs (leave_id, user_id, job_type, scheduled_at, status_text, status_emoji, status)
       VALUES ($1, $2, 'START_LEAVE', $3, $4, $5, 'PENDING')
       ON CONFLICT DO NOTHING`,
      [leaveId, userId, effectiveStartScheduled, statusText, statusEmoji]
    );

    // 2. Insert or update END_LEAVE job
    await pool.query(
      `INSERT INTO slack_status_jobs (leave_id, user_id, job_type, scheduled_at, status_text, status_emoji, status)
       VALUES ($1, $2, 'END_LEAVE', $3, $4, $5, 'PENDING')
       ON CONFLICT DO NOTHING`,
      [leaveId, userId, endScheduledAt, statusText, statusEmoji]
    );

    // 3. Proactively sync all approved leaves for this user in Slack immediately
    setImmediate(() => syncActiveSlackStatuses());
  } catch (err) {
    console.error(`[Slack Scheduler] Error scheduling jobs for leave #${leaveId}:`, err.message);
  }
}

/**
 * Syncs all active/upcoming leaves for all connected Slack users and processes due jobs
 */
export async function syncActiveSlackStatuses() {
  try {
    // 1. Fetch all connected Slack integrations
    const integrationsRes = await pool.query(
      'SELECT user_id, encrypted_access_token FROM slack_integrations'
    );

    if (integrationsRes.rowCount === 0) return;

    for (const integration of integrationsRes.rows) {
      try {
        const userToken = decryptSlackToken(integration.encrypted_access_token);

        // Fetch all approved leaves for this user
        const leavesRes = await pool.query(
          `SELECT id, start_date::text as "startDate", end_date::text as "endDate", leave_type as "leaveType", status
           FROM leave_requests
           WHERE user_id = $1 AND status = 'APPROVED'
           ORDER BY start_date ASC`,
          [integration.user_id]
        );

        const { statusText, statusEmoji, shouldClear } = computeUserSlackStatus(leavesRes.rows);

        const currentProfile = await getUserProfile(userToken);
        const curText = currentProfile.status_text || '';
        const curEmoji = currentProfile.status_emoji || '';

        if (shouldClear) {
          if (curText.toLowerCase().includes('leave')) {
            await setUserProfile(userToken, '', '', 0);
            console.log(`[Slack Sync] ✓ Cleared expired leave status for user #${integration.user_id}`);
          }
        } else if (curText !== statusText || curEmoji !== statusEmoji) {
          await setUserProfile(userToken, statusText, statusEmoji, 0);
          console.log(`[Slack Sync] ✓ Updated dynamic status for user #${integration.user_id}: "${statusText}" ${statusEmoji}`);
        }
      } catch (err) {
        console.error(`[Slack Sync] Failed to sync status for user #${integration.user_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Slack Sync] Error in syncActiveSlackStatuses:', err.message);
  }
}

/**
 * Processes due jobs with PostgreSQL row locking (FOR UPDATE SKIP LOCKED)
 */
export async function processDueSlackJobs() {
  await syncActiveSlackStatuses();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Safe PostgreSQL row-level locking so multiple instances cannot claim the same job
    const claimRes = await client.query(
      `SELECT j.*, i.encrypted_access_token
       FROM (
         SELECT * FROM slack_status_jobs
         WHERE status = 'PENDING' AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT 10
         FOR UPDATE SKIP LOCKED
       ) j
       LEFT JOIN slack_integrations i ON j.user_id = i.user_id`
    );

    const jobs = claimRes.rows;

    if (jobs.length === 0) {
      await client.query('COMMIT');
      return;
    }

    for (const job of jobs) {
      try {
        if (!job.encrypted_access_token) {
          await client.query(
            `UPDATE slack_status_jobs
             SET status = 'CANCELLED', last_error = 'Slack account not connected', updated_at = NOW()
             WHERE id = $1`,
            [job.id]
          );
          continue;
        }

        const userToken = decryptSlackToken(job.encrypted_access_token);

        if (job.job_type === 'START_LEAVE') {
          let prevText = '';
          let prevEmoji = '';
          try {
            const currentProfile = await getUserProfile(userToken);
            prevText = currentProfile.status_text || '';
            prevEmoji = currentProfile.status_emoji || '';
          } catch {}

          await setUserProfile(userToken, job.status_text, job.status_emoji, 0);

          await client.query(
            `UPDATE slack_status_jobs
             SET status = 'COMPLETED', previous_status_text = $1, previous_status_emoji = $2, executed_at = NOW(), updated_at = NOW()
             WHERE id = $3`,
            [prevText, prevEmoji, job.id]
          );

          await client.query(
            `UPDATE slack_status_jobs
             SET previous_status_text = $1, previous_status_emoji = $2, updated_at = NOW()
             WHERE leave_id = $3 AND job_type = 'END_LEAVE' AND status = 'PENDING'`,
            [prevText, prevEmoji, job.leave_id]
          );

          console.log(`[Slack Status] START_LEAVE executed for user #${job.user_id}: "${job.status_text}" ${job.status_emoji}`);

        } else if (job.job_type === 'END_LEAVE') {
          let currentText = '';
          try {
            const currentProfile = await getUserProfile(userToken);
            currentText = currentProfile.status_text || '';
          } catch {}

          if (!currentText || currentText === job.status_text) {
            const restoreText = job.previous_status_text || '';
            const restoreEmoji = job.previous_status_emoji || '';
            await setUserProfile(userToken, restoreText, restoreEmoji, 0);
            console.log(`[Slack Status] END_LEAVE executed for user #${job.user_id}: Restored to "${restoreText}"`);
          }

          await client.query(
            `UPDATE slack_status_jobs
             SET status = 'COMPLETED', executed_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [job.id]
          );
        }
      } catch (jobErr) {
        console.error(`[Slack Status] Job #${job.id} failed:`, jobErr.message);
        const nextRetry = job.retry_count + 1;
        if (nextRetry >= job.max_retries) {
          await client.query(
            `UPDATE slack_status_jobs
             SET status = 'FAILED', retry_count = $1, last_error = $2, updated_at = NOW()
             WHERE id = $3`,
            [nextRetry, jobErr.message, job.id]
          );
        } else {
          await client.query(
            `UPDATE slack_status_jobs
             SET retry_count = $1, last_error = $2, scheduled_at = NOW() + INTERVAL '2 minutes', updated_at = NOW()
             WHERE id = $3`,
            [nextRetry, jobErr.message, job.id]
          );
        }
      }
    }

    await client.query('COMMIT');
  } catch (txErr) {
    await client.query('ROLLBACK');
    console.error('[Slack Scheduler] Transaction error:', txErr.message);
  } finally {
    client.release();
  }
}

/**
 * Starts periodic background polling of due Slack status jobs
 * @param {number} intervalMs 
 */
export function startJobScheduler(intervalMs = 30000) {
  console.log(`[Slack Scheduler] Started with ${intervalMs / 1000}s interval.`);
  // Run once on startup to catch up any jobs missed during restart
  setTimeout(() => processDueSlackJobs(), 2000);
  return setInterval(() => processDueSlackJobs(), intervalMs);
}
