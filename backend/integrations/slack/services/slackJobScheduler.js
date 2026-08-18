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
 * Formats dynamic Slack custom status text and emoji based on the exact leave dates and type
 * @param {string|Date} startDateStr 
 * @param {string|Date} endDateStr 
 * @param {string} leaveType 
 * @returns {{ statusText: string, statusEmoji: string }}
 */
export function formatLeaveSlackStatus(startDateStr, endDateStr, leaveType = 'Annual Leave') {
  const start = parseDateYmd(startDateStr);
  const end = parseDateYmd(endDateStr);

  const startMonth = MONTH_NAMES[start.month];
  const startDay = start.day;
  const endMonth = MONTH_NAMES[end.month];
  const endDay = end.day;

  const isSameDay = start.iso === end.iso;

  let statusText = '';
  if (isSameDay) {
    statusText = `On Leave (${startMonth} ${startDay})`;
  } else if (start.month === end.month) {
    statusText = `On Leave (${startMonth} ${startDay} - ${endDay})`;
  } else {
    statusText = `On Leave (${startMonth} ${startDay} - ${endMonth} ${endDay})`;
  }

  // Choose emoji based on leave type
  let statusEmoji = ':beach_with_umbrella:';
  if (leaveType && leaveType.toLowerCase().includes('sick')) {
    statusEmoji = ':face_with_thermometer:';
  } else if (leaveType && leaveType.toLowerCase().includes('casual')) {
    statusEmoji = ':palm_tree:';
  } else if (leaveType && leaveType.toLowerCase().includes('emergency')) {
    statusEmoji = ':warning:';
  }

  return { statusText, statusEmoji };
}

/**
 * Creates persistent database-backed START_LEAVE and END_LEAVE jobs when leave is approved
 * @param {number} leaveId 
 * @param {number} userId 
 * @param {string|Date} startDateStr 
 * @param {string|Date} endDateStr 
 * @param {string} leaveType 
 */
export async function scheduleSlackStatusJobs(leaveId, userId, startDateStr, endDateStr, leaveType = 'Annual Leave') {
  try {
    // 1. Check if user has an active Slack integration
    const integrationRes = await pool.query(
      'SELECT id, encrypted_access_token FROM slack_integrations WHERE user_id = $1',
      [userId]
    );

    if (integrationRes.rowCount === 0) {
      // User hasn't connected Slack; non-blocking
      return;
    }

    const { statusText, statusEmoji } = formatLeaveSlackStatus(startDateStr, endDateStr, leaveType);

    const sDate = new Date(startDateStr);
    const eDate = new Date(endDateStr);

    // Format start time as beginning of start day, end time as end of day
    const startScheduledAt = new Date(Date.UTC(sDate.getUTCFullYear(), sDate.getUTCMonth(), sDate.getUTCDate(), 0, 0, 0));
    const endScheduledAt = new Date(Date.UTC(eDate.getUTCFullYear(), eDate.getUTCMonth(), eDate.getUTCDate(), 23, 59, 59));

    const now = new Date();
    // If leave has already started or starts today, schedule START_LEAVE immediately
    const effectiveStartScheduled = startScheduledAt <= now ? now : startScheduledAt;

    // 2. Insert START_LEAVE job
    await pool.query(
      `INSERT INTO slack_status_jobs (leave_id, user_id, job_type, scheduled_at, status_text, status_emoji, status)
       VALUES ($1, $2, 'START_LEAVE', $3, $4, $5, 'PENDING')`,
      [leaveId, userId, effectiveStartScheduled, statusText, statusEmoji]
    );

    // 3. Insert END_LEAVE job
    await pool.query(
      `INSERT INTO slack_status_jobs (leave_id, user_id, job_type, scheduled_at, status_text, status_emoji, status)
       VALUES ($1, $2, 'END_LEAVE', $3, $4, $5, 'PENDING')`,
      [leaveId, userId, endScheduledAt, statusText, statusEmoji]
    );

    // If start is due immediately, trigger processor asynchronously
    if (effectiveStartScheduled <= now) {
      setImmediate(() => processDueSlackJobs());
    }
  } catch (err) {
    // Failure in scheduling Slack status must never impact the leave approval
    console.error(`[Slack Scheduler] Error scheduling jobs for leave #${leaveId}:`, err.message);
  }
}

/**
 * Processes due jobs with PostgreSQL row locking (FOR UPDATE SKIP LOCKED)
 */
export async function processDueSlackJobs() {
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
         LIMIT 5
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
          // Employee disconnected Slack
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
          // 1. Fetch and store existing custom status before overwriting
          let prevText = '';
          let prevEmoji = '';
          try {
            const currentProfile = await getUserProfile(userToken);
            prevText = currentProfile.status_text || '';
            prevEmoji = currentProfile.status_emoji || '';
          } catch {
            // Profile fetch non-critical
          }

          // 2. Set dynamic custom status in Slack
          await setUserProfile(userToken, job.status_text, job.status_emoji, 0);

          // 3. Update START_LEAVE job and forward previous status to corresponding END_LEAVE job
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
          // 1. Check current status
          let currentText = '';
          try {
            const currentProfile = await getUserProfile(userToken);
            currentText = currentProfile.status_text || '';
          } catch {
            // Non-critical
          }

          // 2. If status was not manually modified by employee during leave, restore or clear it
          if (!currentText || currentText === job.status_text) {
            const restoreText = job.previous_status_text || '';
            const restoreEmoji = job.previous_status_emoji || '';
            await setUserProfile(userToken, restoreText, restoreEmoji, 0);
            console.log(`[Slack Status] END_LEAVE executed for user #${job.user_id}: Restored to "${restoreText}"`);
          } else {
            console.log(`[Slack Status] END_LEAVE skipped overwrite because employee manually changed status to "${currentText}"`);
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
          // Retry with 2-minute backoff
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
