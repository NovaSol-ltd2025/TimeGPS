import crypto from 'crypto';

const COOKIE_NAME = 'admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET environment variable is not set');
  }
  return secret;
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

// Builds a signed "payload.signature" token. Payload is just
// { adminId, email, exp } base64url-encoded JSON — no external session
// store needed, and it can't be forged without ADMIN_SESSION_SECRET.
export function createSessionToken(admin) {
  const payload = Buffer.from(
    JSON.stringify({
      adminId: admin.id,
      email: admin.email,
      exp: Date.now() + SESSION_TTL_SECONDS * 1000
    })
  ).toString('base64url');
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload);

  const a = Buffer.from(signature || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return data; // { adminId, email, exp }
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token) {
  const maxAge = SESSION_TTL_SECONDS;
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function getAdminSessionFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySessionToken(decodeURIComponent(match[1]));
}

export function isAdminAuthorized(request) {
  return !!getAdminSessionFromRequest(request);
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
