import dotenv from 'dotenv';
dotenv.config();

const SLACK_API_BASE = 'https://slack.com/api';

/**
 * Exchanges OAuth authorization code with Slack for user access token
 * @param {string} code 
 * @returns {Promise<Object>} Slack OAuth response containing authed_user and team
 */
export async function exchangeOAuthCode(code) {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:5000/api/slack/oauth/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Slack OAuth credentials (SLACK_CLIENT_ID, SLACK_CLIENT_SECRET) are missing in environment variables');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri
  });

  const response = await fetch(`${SLACK_API_BASE}/oauth.v2.access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack OAuth exchange failed: ${data.error || 'Unknown error'}`);
  }

  return data;
}

/**
 * Retrieves the current Slack user profile and custom status
 * @param {string} userToken 
 * @returns {Promise<Object>} User profile object
 */
export async function getUserProfile(userToken) {
  if (!userToken) {
    throw new Error('Slack userToken is required to retrieve profile');
  }

  const response = await fetch(`${SLACK_API_BASE}/users.profile.get`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack profile get failed: ${data.error || 'Unknown error'}`);
  }

  return data.profile;
}

/**
 * Sets the Slack user custom status (emoji, text, expiration)
 * @param {string} userToken 
 * @param {string} statusText 
 * @param {string} statusEmoji 
 * @param {number} statusExpiration Unix timestamp in seconds (0 for no expiration)
 * @returns {Promise<Object>}
 */
export async function setUserProfile(userToken, statusText = '', statusEmoji = '', statusExpiration = 0) {
  if (!userToken) {
    throw new Error('Slack userToken is required to update status');
  }

  const payload = {
    profile: {
      status_text: statusText,
      status_emoji: statusEmoji,
      status_expiration: statusExpiration
    }
  };

  const response = await fetch(`${SLACK_API_BASE}/users.profile.set`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack profile set failed: ${data.error || 'Unknown error'}`);
  }

  return data.profile;
}
