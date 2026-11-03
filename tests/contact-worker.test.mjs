// Test the real Pages Worker with mocked upstream HTTP. No real keys or emails.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../_worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const origin = 'https://typefolioapp.nazrin.codes';
const valid = {
  name: 'Visitor', email: 'visitor@example.com', topic: 'General question',
  message: 'A local test only. Unicode: café, 钱, £. <script>not HTML</script>',
  website: '', token: 'test-token', submissionId: 'fc8dcb1c-8b3b-4ad0-9c08-18e2864df2f6',
};
const env = {
  TURNSTILE_SITE_KEY: 'public-test-key', TURNSTILE_SECRET_KEY: 'fake-test-secret', RESEND_API_KEY: 'fake-resend-key',
  CONTACT_FROM_EMAIL: 'website@typefolioapp.nazrin.codes',
  ASSETS: { fetch: () => new Response('static asset') },
};
const verification = { success: true, action: 'contact', hostname: 'typefolioapp.nazrin.codes' };
function request(input = valid, { method = 'POST', host = origin, headers = {}, raw } = {}) {
  return new Request(`${host}/api/contact`, {
    method, headers: { Origin: host, 'Content-Type': 'application/json', ...headers },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: raw ?? JSON.stringify(input) }),
  });
}
async function run(req = request(), { settings = env, verify = verification, verifyStatus = 200, send = { id: 'email-test-id' }, sendStatus = 200, fail } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const phase = url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify' ? 'verify' : 'send';
    assert(['https://challenges.cloudflare.com/turnstile/v0/siteverify', 'https://api.resend.com/emails'].includes(url));
    calls.push({ phase, body: JSON.parse(options.body), headers: options.headers });
    if (fail === phase) throw new Error('Simulated unavailable upstream');
    return Response.json(phase === 'verify' ? verify : send, { status: phase === 'verify' ? verifyStatus : sendStatus });
  };
  try {
    const response = await worker.fetch(req, settings);
    const result = { status: response.status, body: await response.json(), calls, headers: response.headers };
    assert(!JSON.stringify(result.body).includes('fake-'), 'Never expose credentials');
    assert.equal(result.headers.get('cache-control'), 'no-store');
    return result;
  } finally { globalThis.fetch = originalFetch; }
}
assert.equal(await (await worker.fetch(new Request(`${origin}/styles.css`), env)).text(), 'static asset');
assert.deepEqual((await run(request(null, { method: 'GET' }))).body, { ready: true, sitekey: 'public-test-key' });
assert.deepEqual((await run(request(null, { method: 'GET' }), { settings: {} })).body, { ready: false, sitekey: null });
for (const [req, status] of [
  [request(valid, { host: 'https://attacker.example' }), 403],
  [request(valid, { headers: { Origin: 'https://attacker.example' } }), 403],
  [request(valid, { headers: { Origin: '' } }), 403],
  [request(valid, { method: 'PUT' }), 405],
  [request(valid, { headers: { 'Content-Type': 'text/plain' } }), 415],
  [request(valid, { raw: '{invalid JSON' }), 400],
  [request(null), 400], [request([]), 400],
  [request(valid, { headers: { 'Content-Length': '30000' } }), 413],
  [request(valid, { raw: JSON.stringify({ ...valid, message: 'x'.repeat(22000) }) }), 413],
]) {
  const result = await run(req);
  assert.equal(result.status, status);
  assert.equal(result.calls.length, 0, 'Invalid request never calls upstream services');
}
for (const change of [
  { name: 'x'.repeat(81) }, { name: 'Name\r\nBcc: bad@example.com' },
  { email: 'invalid' }, { email: 'ok@example.com\nBcc: bad@example.com' },
  { topic: 'Unexpected' }, { message: '          ' }, { message: 'x'.repeat(3001) },
  { message: 'Invalid NUL\0 in text' }, { website: 'bot.example' },
  { token: '' }, { token: 'x'.repeat(2049) }, { token: null },
  { submissionId: 'not-a-uuid' }, { name: 2 },
]) {
  const result = await run(request({ ...valid, ...change }));
  assert.equal(result.status, 400);
  assert.equal(result.calls.length, 0);
}
const missingSecret = await run(request(), { settings: { ...env, TURNSTILE_SECRET_KEY: '' } });
assert.equal(missingSecret.status, 503); assert.equal(missingSecret.calls.length, 0);
for (const verify of [
  { ...verification, success: false, 'error-codes': ['timeout-or-duplicate'] },
  { ...verification, success: 'true' }, { ...verification, action: 'other' },
  { ...verification, hostname: 'attacker.example' }, {}, null,
]) {
  const result = await run(request(), { verify });
  assert(result.status >= 400);
  assert.equal(result.calls.length, 1, 'No Resend call unless verification succeeds');
}
for (const options of [{ verifyStatus: 500 }, { fail: 'verify' }]) {
  const result = await run(request(), options);
  assert.equal(result.body.code, 'verification_unavailable');
  assert.equal(result.calls.length, 1);
}
for (const settings of [{ ...env, RESEND_API_KEY: '' }, { ...env, CONTACT_FROM_EMAIL: '' }]) {
  const result = await run(request(), { settings });
  assert.equal(result.body.code, 'not_configured');
  assert.equal(result.calls.length, 1);
}
const success = await run(request(valid, { headers: { 'CF-Connecting-IP': '192.0.2.1' } }));
assert.equal(success.status, 200);
assert.deepEqual(success.body, { ok: true });
assert.deepEqual(success.calls.map((call) => call.phase), ['verify', 'send']);
assert.deepEqual(success.calls[0].body, { secret: env.TURNSTILE_SECRET_KEY, response: 'test-token', remoteip: '192.0.2.1' });
const sent = success.calls[1];
assert.deepEqual(sent.body.to, ['support@typefolioapp.nazrin.codes']);
assert.equal(sent.body.from, 'Type Folio Website <website@typefolioapp.nazrin.codes>');
assert.equal(sent.body.reply_to, valid.email);
assert.equal(sent.body.html, undefined);
assert(sent.body.text.includes(valid.message), 'Keep Unicode and literal markup in plain text');
assert.equal(sent.headers.Authorization, `Bearer ${env.RESEND_API_KEY}`);
assert(sent.headers['Idempotency-Key'].length < 256);
for (const options of [{ sendStatus: 429 }, { sendStatus: 500 }, { send: {} }, { fail: 'send' }]) {
  const result = await run(request(), options);
  assert.equal(result.status, 502);
  assert.equal(result.body.ok, false, 'No false success on email failure or uncertainty');
}
const retry = await run(request({ ...valid, token: 'fresh-token' }));
assert.equal(retry.calls[1].headers['Idempotency-Key'], sent.headers['Idempotency-Key']);
const edited = await run(request({ ...valid, message: valid.message + ' edited' }));
assert.notEqual(edited.calls[1].headers['Idempotency-Key'], sent.headers['Idempotency-Key']);
const preview = await run(request(valid, { host: 'https://actual-project.pages.dev' }), {
  settings: { ...env, CONTACT_ALLOWED_HOSTNAMES: 'typefolioapp.nazrin.codes,actual-project.pages.dev' },
  verify: { ...verification, hostname: 'actual-project.pages.dev' },
});
assert.equal(preview.status, 200);
console.log('PASS: Pages routing, readiness, hostname/origin protection, body/field validation, server-side verification, fixed recipient, email failures, and idempotent retries. No email sent.');
