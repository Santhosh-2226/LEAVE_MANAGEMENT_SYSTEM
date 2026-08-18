import dotenv from 'dotenv';
dotenv.config();

let nodemailerModule = null;
try {
  nodemailerModule = await import('nodemailer');
} catch {
  // If nodemailer not yet loaded
}

/**
 * Creates SMTP transporter if configured in .env, otherwise returns null
 */
function getTransporter() {
  if (!nodemailerModule || !nodemailerModule.default) return null;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS;

  if (!host || !user || !rawPass) {
    return null;
  }

  const pass = rawPass.replace(/\s+/g, '');

  return nodemailerModule.default.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

/**
 * Helper to send email safely without throwing
 */
async function sendEmailSafely({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || 'no-reply@leavemanagement.corp';
  console.log(`[Email Notification] ✉️ Sending email to: ${to} | Subject: "${subject}"`);

  try {
    const transporter = getTransporter();
    if (!transporter) {
      console.log(`[Email Logged - Mock/Dev Mode]:\nTo: ${to}\nFrom: ${from}\nSubject: ${subject}\n\n${text}\n---------------------------------`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html: html || text
    });

    console.log(`[Email Notification] ✓ Delivered message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    // CRITICAL: Email failure must NEVER fail the leave transaction
    console.error(`[Email Notification] ⚠️ Failed to send email to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 1. Notify approver when a new leave is applied
 */
export async function notifyLeaveApplied({ requester, approver, leave }) {
  if (!approver || !approver.email) return;

  const subject = `New Leave Request: ${requester.name} (${leave.leaveType || leave.leave_type})`;
  const text = `
Hello ${approver.name},

A new leave request requires your review:

Employee: ${requester.name} (${requester.role})
Leave Type: ${leave.leaveType || leave.leave_type}
Start Date: ${leave.startDate || leave.start_date}
End Date: ${leave.endDate || leave.end_date}
Working Days: ${leave.workingDays || leave.working_days}
Reason: ${leave.reason || 'None provided'}

Please log into the Leave Management System to review and approve/reject.
`;

  return sendEmailSafely({ to: approver.email, subject, text });
}

/**
 * 2. Notify Tier-2 approver when Tier-1 approval is complete
 */
export async function notifyTier2Handoff({ requester, nextApprover, leave }) {
  if (!nextApprover || !nextApprover.email) return;

  const subject = `[Action Required - Tier 2] Leave Request: ${requester.name}`;
  const text = `
Hello ${nextApprover.name},

A multi-tier leave request has been approved at Tier 1 and now requires your Tier 2 approval:

Employee: ${requester.name} (${requester.role})
Leave Type: ${leave.leaveType || leave.leave_type}
Start Date: ${leave.startDate || leave.start_date}
End Date: ${leave.endDate || leave.end_date}
Working Days: ${leave.workingDays || leave.working_days}
Reason: ${leave.reason || 'None provided'}

Please log into the Leave Management System to take action.
`;

  return sendEmailSafely({ to: nextApprover.email, subject, text });
}

/**
 * 3. Notify employee when their leave is approved
 */
export async function notifyLeaveApproved({ requester, leave, decidedBy }) {
  if (!requester || !requester.email) return;

  const subject = `Leave Request APPROVED: ${leave.startDate || leave.start_date} to ${leave.endDate || leave.end_date}`;
  const text = `
Hello ${requester.name},

Your leave request has been APPROVED.

Leave Type: ${leave.leaveType || leave.leave_type}
Start Date: ${leave.startDate || leave.start_date}
End Date: ${leave.endDate || leave.end_date}
Working Days: ${leave.workingDays || leave.working_days}
Decision Details: ${decidedBy || 'Approved by Manager'}

Your leave balance and team calendar have been updated accordingly.
`;

  return sendEmailSafely({ to: requester.email, subject, text });
}

/**
 * 4. Notify employee when their leave is rejected
 */
export async function notifyLeaveRejected({ requester, leave, decidedBy }) {
  if (!requester || !requester.email) return;

  const subject = `Leave Request Update: ${leave.startDate || leave.start_date} to ${leave.endDate || leave.end_date}`;
  const text = `
Hello ${requester.name},

Your leave request has been REJECTED.

Leave Type: ${leave.leaveType || leave.leave_type}
Start Date: ${leave.startDate || leave.start_date}
End Date: ${leave.endDate || leave.end_date}
Working Days: ${leave.workingDays || leave.working_days}
Decision Details: ${decidedBy || 'Rejected by Manager'}

Please contact your manager if you have questions.
`;

  return sendEmailSafely({ to: requester.email, subject, text });
}
