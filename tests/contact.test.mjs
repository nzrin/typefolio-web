// Run the actual browser script with local mocks. No email or external requests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const script = await readFile(new URL('../contact.js', import.meta.url), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function setup({ available = true, width = 340, lazy = false, scriptMissing = false, healthFails = false, reply } = {}) {
  const elements = new Map();
  const calls = [], widgets = [], resets = [], removals = [], scripts = [];
  let observerCallback, resizeCallback;
  for (const id of ['form', 'submit', 'submit-label', 'status', 'verification-status', 'delivery-note', 'retry', 'turnstile', 'name', 'email', 'topic', 'message', 'website']) {
    elements.set(`#contact-${id}`, {
      value: '', textContent: '', disabled: id === 'submit', hidden: true, type: 'button',
      clientWidth: width, dataset: { contactEndpoint: '/api/contact', turnstileSitekey: 'public-test-key' },
      listeners: new Map(), validityMessage: '', attributes: new Map(),
      addEventListener(type, fn) { this.listeners.set(type, fn); },
      setCustomValidity(message) { this.validityMessage = message; },
      setAttribute(key, value) { this.attributes.set(key, value); },
    });
  }
  const field = (name) => elements.get(`#contact-${name}`);
  field('form').reportValidity = () => !field('message').validityMessage && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field('email').value);
  field('form').reset = () => {
    for (const name of ['name', 'email', 'message', 'website']) field(name).value = '';
    field('topic').value = 'General question';
  };
  const turnstile = {
    render(selector, options) { assert.equal(selector, '#contact-turnstile'); widgets.push(options); return `widget-${widgets.length}`; },
    reset(id) { resets.push(id); }, remove(id) { removals.push(id); },
  };
  const ResizeObserver = class { constructor(callback) { resizeCallback = callback; } observe() {} };
  const IntersectionObserver = class { constructor(callback) { observerCallback = callback; } observe() {} disconnect() {} };
  const window = { crypto: webcrypto, ResizeObserver, ...(scriptMissing ? {} : { turnstile }), ...(lazy ? { IntersectionObserver } : {}) };
  vm.runInNewContext(script, {
    window, ResizeObserver, IntersectionObserver, AbortController, setTimeout, clearTimeout,
    document: {
      querySelector: (selector) => elements.get(selector),
      createElement: () => ({ remove() {} }), head: { append(element) { scripts.push(element); } },
    },
    async fetch(url, options) {
      assert.equal(url, '/api/contact');
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.cache, 'no-store');
      if (!options.method) {
        if (healthFails) return new Response('<html>Static host</html>');
        return Response.json({ ready: available, sitekey: 'public-test-key' });
      }
      calls.push(JSON.parse(options.body));
      return reply ? reply(calls.at(-1)) : Response.json({ ok: true });
    },
  });
  field('name').value = 'Website test';
  field('email').value = ' visitor@example.com ';
  field('topic').value = 'Privacy or terms';
  field('message').value = 'Hello &bcc=someone@example.com\nUnicode: café, 钱, £.';
  await flush();
  return {
    field, calls, widgets, resets, removals, scripts, window, turnstile,
    resize(size) { field('turnstile').clientWidth = size; resizeCallback(); },
    approach() { observerCallback([{ isIntersecting: true }]); },
    verify(token = 'test-token') { widgets.at(-1).callback(token); },
    retry() { field('retry').listeners.get('click')(); },
    async submit() {
      let prevented = false;
      await field('form').listeners.get('submit')({ preventDefault() { prevented = true; } });
      assert(prevented, 'Never navigate with form data');
    },
  };
}

const lazy = await setup({ lazy: true });
assert.equal(lazy.widgets.length, 0, 'Do not load Turnstile before the form is approached');
lazy.approach(); await flush();
assert.equal(lazy.widgets.length, 1);
lazy.approach(); assert.equal(lazy.widgets.length, 1, 'Do not render duplicate widgets');
assert.equal(lazy.widgets[0].action, 'contact');
assert.equal(lazy.widgets[0].sitekey, 'public-test-key');
assert.equal(lazy.widgets[0]['response-field'], false);
assert(lazy.field('submit').disabled, 'Token is required even when server is ready');
await lazy.submit(); assert.equal(lazy.calls.length, 0);
lazy.verify(); assert.equal(lazy.field('submit').disabled, false);

for (const options of [{ available: false }, { healthFails: true }]) {
  const unavailable = await setup(options);
  assert.equal(unavailable.widgets.length, 0, 'Do not load a widget before configuration is ready');
  assert(unavailable.field('submit').disabled);
  await unavailable.submit();
  assert.equal(unavailable.calls.length, 0);
  assert(unavailable.field('message').value);
}

for (const callback of ['expired-callback', 'timeout-callback', 'error-callback', 'unsupported-callback']) {
  const check = await setup(); check.verify();
  check.widgets[0][callback]();
  assert(check.field('submit').disabled);
  assert.equal(check.field('retry').hidden, false);
  await check.submit(); assert.equal(check.calls.length, 0);
  check.retry(); assert.equal(check.resets.length, 1);
  check.verify('new-token'); assert.equal(check.field('submit').disabled, false);
}

const narrow = await setup({ width: 240 });
assert.equal(narrow.widgets[0].size, 'compact', 'Widget fits narrow phones');
narrow.verify(); narrow.resize(350);
assert.equal(narrow.widgets.at(-1).size, 'flexible');
assert.equal(narrow.removals.length, 1);
assert(narrow.field('submit').disabled, 'Resizing never reuses a removed widget token');

const scriptError = await setup({ scriptMissing: true });
assert.match(scriptError.scripts[0].src, /^https:\/\/challenges.cloudflare.com\/turnstile/);
scriptError.scripts[0].onerror();
assert.equal(scriptError.field('retry').hidden, false);
scriptError.retry(); await flush();
assert.equal(scriptError.scripts.length, 2);
scriptError.window.turnstile = scriptError.turnstile;
scriptError.window.typeFolioTurnstileReady();
scriptError.verify(); assert.equal(scriptError.field('submit').disabled, false);

for (const [name, value] of [['message', 'short'], ['message', '          '], ['email', 'invalid'], ['topic', 'Unexpected']]) {
  const invalid = await setup(); invalid.verify(); invalid.field(name).value = value;
  await invalid.submit(); assert.equal(invalid.calls.length, 0);
}

let finishSend;
const pending = await setup({ reply: () => new Promise((resolve) => { finishSend = resolve; }) });
pending.verify();
const sending = pending.submit();
assert.equal(pending.field('submit-label').textContent, 'Sending…');
assert(pending.field('email').disabled);
assert(pending.field('retry').disabled);
await pending.submit(); assert.equal(pending.calls.length, 1, 'No concurrent duplicate send');
finishSend(Response.json({ ok: true })); await sending;
assert.equal(pending.field('message').value, '');
assert.equal(pending.field('submit-label').textContent, 'Send message');
assert.match(pending.field('status').textContent, /submitted to our email service/);
assert.equal(pending.field('email').disabled, false);
assert(pending.field('submit').disabled, 'Next send requires a fresh token');
assert.equal(pending.resets.length, 1);
assert.equal(pending.calls[0].email, 'visitor@example.com');
assert.match(pending.calls[0].message, /café, 钱, £/);
assert.match(pending.calls[0].submissionId, /^[0-9a-f-]{36}$/);

for (const code of ['invalid_input', 'verification_failed', 'verification_unavailable', 'not_configured', 'send_failed', 'send_unconfirmed']) {
  const failed = await setup({ reply: () => Response.json({ ok: false, code }, { status: 503 }) });
  failed.verify(); const message = failed.field('message').value;
  await failed.submit();
  assert.equal(failed.field('message').value, message, `${code}: preserve message`);
  assert(!failed.field('status').textContent.includes('Thank you!'));
  assert(failed.field('submit').disabled);
  failed.verify('second-token'); await failed.submit();
  assert.equal(failed.calls[0].submissionId, failed.calls[1].submissionId, 'Reuse ID for unchanged retry');
  assert.notEqual(failed.calls[0].token, failed.calls[1].token, 'Use a new Turnstile token');
  failed.field('message').value += ' Edited.';
  failed.verify('third-token'); await failed.submit();
  assert.notEqual(failed.calls[1].submissionId, failed.calls[2].submissionId, 'Edited message gets a new ID');
}
for (const reply of [() => { throw new Error('offline'); }, () => new Response('<html>Error</html>')]) {
  const failed = await setup({ reply }); failed.verify(); await failed.submit();
  assert(failed.field('message').value);
  assert.match(failed.field('status').textContent, /could not confirm/);
}
console.log('PASS: contact readiness, lazy loading, mobile sizing, token expiry/retry, validation, sending state, failure preservation, and duplicate protection. No email sent.');
