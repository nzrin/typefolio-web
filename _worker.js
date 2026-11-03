/* Cloudflare Pages advanced-mode Worker. No credentials are stored in this file. */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESEND = 'https://api.resend.com/emails';
const SUPPORT_EMAIL = 'support@typefolioapp.nazrin.codes';
const DEFAULT_HOSTNAME = 'typefolioapp.nazrin.codes';
const MAX_BODY_BYTES = 20 * 1024;
const TOPICS = new Set(['General question', 'Bug report', 'Feature idea', 'Privacy or terms']);
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return Response.json(data, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
function error(code, status) { return json({ ok: false, code }, status); }
function configured(env) {
  return Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.RESEND_API_KEY && EMAIL.test(env.CONTACT_FROM_EMAIL || ''));
}
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new Error('too_large');
  if (!request.body) throw new Error('invalid_input');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('too_large'); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}
async function postJSON(url, body, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body), signal: controller.signal,
    });
    return { response, data: await response.json() };
  } finally { clearTimeout(timeout); }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/contact') return env.ASSETS.fetch(request);
    const hostnames = (env.CONTACT_ALLOWED_HOSTNAMES || DEFAULT_HOSTNAME).split(',').map((host) => host.trim().toLowerCase());
    if (!hostnames.includes(url.hostname)) return error('forbidden', 403);
    if (request.method === 'GET') return json({ ready: configured(env), sitekey: configured(env) ? env.TURNSTILE_SITE_KEY : null });
    if (request.method !== 'POST') return error('method_not_allowed', 405);
    // Browsers send Origin on this same-origin JSON POST. No cross-origin API.
    if (request.headers.get('origin') !== url.origin) return error('forbidden', 403);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return error('invalid_input', 415);
    let input;
    try { input = await readBody(request); }
    catch (failure) { return error('invalid_input', failure.message === 'too_large' ? 413 : 400); }
    if (!input || Array.isArray(input) || typeof input !== 'object') return error('invalid_input', 400);
    const { name, email, topic, message, website, token, submissionId } = input;
    if ([name, email, topic, message, website, token, submissionId].some((value) => typeof value !== 'string') ||
        name.length > 80 || /[\x00-\x1f\x7f]/.test(name) ||
        email.length > 254 || !EMAIL.test(email) || !TOPICS.has(topic) ||
        message.trim().length < 10 || message.length > 3000 || message.includes('\0') ||
        website !== '' || !UUID.test(submissionId)) return error('invalid_input', 400);
    if (!token || token.length > 2048) return error('verification_failed', 400);
    if (!env.TURNSTILE_SECRET_KEY) return error('not_configured', 503);
    let verification;
    try {
      const result = await postJSON(SITEVERIFY, {
        secret: env.TURNSTILE_SECRET_KEY, response: token,
        ...(request.headers.get('CF-Connecting-IP') ? { remoteip: request.headers.get('CF-Connecting-IP') } : {}),
      });
      if (!result.response.ok || !result.data) return error('verification_unavailable', 503);
      verification = result.data;
    } catch { return error('verification_unavailable', 503); }
    if (verification.success !== true || verification.hostname !== url.hostname || verification.action !== 'contact') {
      return error('verification_failed', 400);
    }
    if (!configured(env)) return error('not_configured', 503);
    const mail = {
      from: `Type Folio Website <${env.CONTACT_FROM_EMAIL}>`,
      to: [SUPPORT_EMAIL], reply_to: email,
      subject: `Type Folio — ${topic}`,
      // Plain text: visitor content is never evaluated as HTML or email headers.
      text: `Name: ${name.trim() || 'Not provided'}\nReply email: ${email}\nTopic: ${topic}\n\n${message.trim()}`,
    };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(mail)));
    const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    try {
      const sent = await postJSON(RESEND, mail, {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Idempotency-Key': `type-folio/${submissionId}/${fingerprint}`,
      });
      if (!sent.response.ok) return error('send_failed', 502);
      if (typeof sent.data?.id !== 'string' || !sent.data.id) return error('send_unconfirmed', 502);
      return json({ ok: true });
    } catch {
      // A timeout can occur after acceptance; retry uses the same idempotency key.
      return error('send_unconfirmed', 502);
    }
  },
};
