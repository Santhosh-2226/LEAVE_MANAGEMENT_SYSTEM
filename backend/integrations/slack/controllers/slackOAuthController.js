import crypto from 'crypto';
import dotenv from 'dotenv';
import { pool } from '../../../db/pool.js';
import { exchangeOAuthCode, getUserProfile } from '../services/slackApiService.js';
import { encryptSlackToken } from '../utils/slackTokenEncryption.js';

dotenv.config();

// In-memory OAuth state cache with 15-minute TTL to prevent CSRF attacks
const oauthStateCache = new Map(); // state -> { userId, timestamp }

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStateCache.entries()) {
    if (now - data.timestamp > 15 * 60 * 1000) {
      oauthStateCache.delete(state);
    }
  }
}, 5 * 60 * 1000);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Initiates the Slack OAuth 2.0 User authorization flow
 * GET /api/slack/oauth/authorize?userId=1
 */
export async function authorize(req, res) {
  const userId = parseInt(req.query.userId);
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'Valid userId query parameter is required to initiate Slack connection' });
  }

  try {
    const userRes = await pool.query('SELECT id, name FROM users WHERE id = $1', [userId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:5000/api/slack/oauth/callback';

    if (!clientId) {
      return res.status(500).json({
        error: 'Slack Integration is not configured. SLACK_CLIENT_ID is missing in environment variables.'
      });
    }

    // Generate secure random state and store with userId
    const state = crypto.randomBytes(24).toString('hex');
    oauthStateCache.set(state, {
      userId,
      timestamp: Date.now()
    });

    // Request only the exact required user scopes
    const userScopes = 'users.profile:read,users.profile:write';
    const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(clientId)}&user_scope=${encodeURIComponent(userScopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

    return res.redirect(slackAuthUrl);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Handles Slack OAuth redirect callback, exchanges code, encrypts token and saves integration
 * GET /api/slack/oauth/callback?code=...&state=...
 */
export async function callback(req, res) {
  const { code, state, error: slackError } = req.query;

  if (slackError) {
    return res.redirect(`${FRONTEND_URL}/?slack_error=${encodeURIComponent(slackError)}`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/?slack_error=missing_code_or_state`);
  }

  const cached = oauthStateCache.get(state);
  if (!cached) {
    return res.redirect(`${FRONTEND_URL}/?slack_error=invalid_or_expired_state`);
  }

  // Single-use state verification
  oauthStateCache.delete(state);
  const { userId } = cached;

  try {
    // Exchange authorization code for user access token
    const oauthData = await exchangeOAuthCode(code);
    const authedUser = oauthData.authed_user;

    if (!authedUser || !authedUser.access_token || !authedUser.id) {
      throw new Error('Slack OAuth response did not contain user token or user id');
    }

    const slackUserId = authedUser.id;
    const slackUserToken = authedUser.access_token;
    const slackTeamId = oauthData.team?.id || null;

    // Fetch user profile to get friendly display name
    let slackUserName = authedUser.id;
    try {
      const profile = await getUserProfile(slackUserToken);
      slackUserName = profile.display_name || profile.real_name || profile.real_name_normalized || authedUser.id;
    } catch {
      // Non-fatal if profile get fails during onboarding
    }

    // Encrypt token using AES-256-GCM before saving to database
    const encryptedToken = encryptSlackToken(slackUserToken);

    // Save or update employee Slack integration record
    await pool.query(
      `INSERT INTO slack_integrations (user_id, slack_user_id, slack_team_id, encrypted_access_token, slack_user_name, connected_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())
       ON CONFLICT (user_id) DO UPDATE
       SET slack_user_id = EXCLUDED.slack_user_id,
           slack_team_id = EXCLUDED.slack_team_id,
           encrypted_access_token = EXCLUDED.encrypted_access_token,
           slack_user_name = EXCLUDED.slack_user_name,
           updated_at = now()`,
      [userId, slackUserId, slackTeamId, encryptedToken, slackUserName]
    );

    // Redirect to React application with success indicator
    return res.redirect(`${FRONTEND_URL}/?slack=connected&user_id=${userId}`);
  } catch (err) {
    return res.redirect(`${FRONTEND_URL}/?slack_error=${encodeURIComponent(err.message)}`);
  }
}

/**
 * Returns connection status and public Slack username for the specified user
 * GET /api/slack/status?userId=1
 */
export async function getStatus(req, res) {
  const userId = parseInt(req.query.userId);
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'Valid userId query parameter is required' });
  }

  try {
    const result = await pool.query(
      'SELECT slack_user_id, slack_user_name, slack_team_id, connected_at FROM slack_integrations WHERE user_id = $1',
      [userId]
    );

    if (result.rowCount === 0) {
      return res.json({ connected: false });
    }

    const row = result.rows[0];
    return res.json({
      connected: true,
      slackUser: {
        id: row.slack_user_id,
        name: row.slack_user_name,
        teamId: row.slack_team_id
      },
      connectedAt: row.connected_at
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Disconnects the user's Slack account
 * POST /api/slack/disconnect
 */
export async function disconnect(req, res) {
  const userId = parseInt(req.body.userId);
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'Valid userId is required in request body' });
  }

  try {
    const result = await pool.query('DELETE FROM slack_integrations WHERE user_id = $1', [userId]);

    if (result.rowCount === 0) {
      return res.json({ success: true, message: 'No active Slack connection found' });
    }

    return res.json({ success: true, message: 'Slack account disconnected successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
