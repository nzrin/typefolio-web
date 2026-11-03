import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const code = read("../reset.js");
const token = "example_recovery_hash_not_a_real_token_123456";
const validLink = `https://typefolioapp.nazrin.codes/reset?token_hash=${token}&type=recovery`;
const authUrl = "https://gfsowksgljsvhjjfsill.supabase.co/auth/v1";
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

function harness({ url = validLink, send, historyFails = false } = {}) {
  const nodes = new Map();
  const docEvents = {};
  const windowEvents = {};
  const calls = [];
  const history = [];
  const node = () => ({
    value: "", disabled: true, hidden: false, textContent: "", type: "password",
    dataset: {}, attributes: {}, events: {}, focused: false,
    addEventListener(name, fn) { this.events[name] = fn; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { this.focused = true; },
  });
  for (const selector of ["[data-reset-form]", "[data-reset-fields]", "[data-reset-submit]", "reset-status", "new-password", "confirm-password", "reset-title", "[data-reset-description]", "[data-reset-help]", "[data-reset-success]"]) nodes.set(selector, node());
  const get = (key) => nodes.get(key);
  const form = get("[data-reset-form]");
  form.reset = () => { get("new-password").value = ""; get("confirm-password").value = ""; };
  get("[data-reset-success]").hidden = true;
  const toggles = ["new-password", "confirm-password"].map((id) => {
    const toggle = node();
    toggle.dataset.passwordToggle = id;
    toggle.attributes["aria-label"] = "Show " + id;
    return toggle;
  });
  const context = {
    URL, AbortController, setTimeout, clearTimeout,
    document: {
      querySelector: get, getElementById: get, querySelectorAll: () => toggles,
      addEventListener: (event, fn) => { docEvents[event] = fn; },
    },
    window: {
      location: { href: url },
      history: { replaceState(state, title, path) { if (historyFails) throw Error("blocked"); history.push(path); } },
      addEventListener: (event, fn) => { windowEvents[event] = fn; },
    },
    fetch: async (url, args) => {
      calls.push({ url, ...args, body: JSON.parse(args.body) });
      if (send) return send(url, args);
      return response(url.endsWith("/verify") ? { access_token: "test-recovery-session", refresh_token: "must-not-be-stored" } : { id: "test-user" });
    },
  };
  vm.runInNewContext(code, context);
  assert.equal(calls.length, 0, "No authentication request before DOM ready");
  docEvents.DOMContentLoaded();
  return {
    get, calls, history, toggles, windowEvents,
    submit: () => form.events.submit({ preventDefault() {} }),
    fill(password = "A test passphrase 123!", confirmation = password) {
      get("new-password").value = password;
      get("confirm-password").value = confirmation;
    },
    get status() { return get("reset-status").textContent; },
    get disabled() { return get("[data-reset-submit]").disabled; },
  };
}

test("email links to Type Folio with an unconsumed recovery hash", () => {
  const email = read("../tools/email-templates/reset.html");
  assert.match(email, /Your password will remain unchanged/);
  const links = [...email.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(links.length, 2);
  for (const link of links) assert.equal(link, "https://typefolioapp.nazrin.codes/reset?token_hash={{ .TokenHash }}&amp;type=recovery");
  assert.doesNotMatch(email, /gridfolio|Grid Folio|ConfirmationURL/);
});

test("page captures the token before other resources; recovery data is not stored", () => {
  const html = read("../reset.html");
  assert.ok(html.indexOf('src="/reset.js"') < html.indexOf('href="/styles.css"'));
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /<fieldset data-reset-fields disabled>/);
  assert.equal((html.match(/autocomplete="new-password"/g) || []).length, 2);
  assert.doesNotMatch(code, /localStorage|sessionStorage|document\.cookie|console\./);
  // web/ is also deployed as a standalone Git repository. When the Flutter
  // workspace is present, additionally guard against client-config drift.
  const appConfig = new URL("../../lib/auth/config/supabase_config.dart", import.meta.url);
  if (existsSync(appConfig)) {
    const app = readFileSync(appConfig, "utf8");
    for (const value of [authUrl.replace("/auth/v1", ""), code.match(/const apiKey = "([^"]+)"/)[1]]) assert.ok(app.includes(value));
  }
});

test("deployment allows only this Supabase origin and protects reset URLs", () => {
  const headers = read("../_headers");
  assert.match(headers, /connect-src 'self' https:\/\/gfsowksgljsvhjjfsill\.supabase\.co;/);
  for (const path of ["/reset", "/reset.html", "/reset/"]) {
    const block = headers.split("\n\n").find((block) => block.startsWith(path + "\n"));
    assert.ok(block, path);
    assert.match(block, /Referrer-Policy: no-referrer/);
    assert.match(block, /Cache-Control: no-store/);
    assert.match(block, /X-Robots-Tag: noindex, nofollow/);
  }
});

test("loading a valid email link strips parameters without consuming the token", () => {
  const h = harness();
  assert.deepEqual(h.history, ["/reset"]);
  assert.equal(h.calls.length, 0);
  assert.equal(h.disabled, false);
  assert.match(h.status, /Enter and confirm/);
});

test("missing, malformed, ambiguous, non-recovery and provider-error links fail closed", async () => {
  const invalid = ["", "?type=recovery", "?token_hash=short&type=recovery", `?token_hash=${token}&type=signup`, `?token_hash=${token}&type=recovery&error=expired`, `?token_hash=${token}&type=recovery&type=signup`, `?token_hash=${token}&token_hash=other&type=recovery`, "#access_token=not-a-recovery-link"];
  for (const suffix of invalid) {
    const h = harness({ url: "https://typefolioapp.nazrin.codes/reset" + suffix });
    h.fill();
    await h.submit();
    assert.equal(h.disabled, true, suffix);
    assert.equal(h.calls.length, 0);
    assert.match(h.status, /Request a new link/);
  }
  assert.equal(harness({ historyFails: true }).disabled, true);
});

test("password validation does not consume a recovery token", async () => {
  const h = harness();
  h.fill("short");
  await h.submit();
  assert.match(h.status, /at least 8/);
  assert.equal(h.get("new-password").attributes["aria-invalid"], "true");
  h.fill("long enough", "different");
  await h.submit();
  assert.match(h.status, /don’t match/);
  assert.equal(h.calls.length, 0);
});

test("successful reset verifies once, updates only password, clears fields and ends the recovery session", async () => {
  const h = harness();
  h.fill();
  await h.submit();
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[0].url, authUrl + "/verify");
  assert.equal(h.calls[0].method, "POST");
  assert.deepEqual(h.calls[0].body, { token_hash: token, type: "recovery" });
  assert.equal(h.calls[0].headers.Authorization, undefined);
  assert.equal(h.calls[1].url, authUrl + "/user");
  assert.equal(h.calls[1].method, "PUT");
  assert.equal(h.calls[1].headers.Authorization, "Bearer test-recovery-session");
  assert.deepEqual(h.calls[1].body, { password: "A test passphrase 123!" });
  assert.equal(h.calls[2].url, authUrl + "/logout?scope=local");
  for (const call of h.calls) {
    assert.equal(call.cache, "no-store");
    assert.equal(call.credentials, "omit");
    assert.equal(call.referrerPolicy, "no-referrer");
    assert.match(call.headers.apikey, /^sb_publishable_/);
  }
  assert.equal(h.get("new-password").value, "");
  assert.equal(h.get("confirm-password").value, "");
  assert.equal(h.get("[data-reset-form]").hidden, true);
  assert.equal(h.get("[data-reset-success]").hidden, false);
  assert.match(h.status, /successfully/);
  await h.submit();
  assert.equal(h.calls.length, 3);
});

test("expired or consumed tokens never reach the password update endpoint", async () => {
  const h = harness({ send: () => response({ error_code: "otp_expired" }, 403) });
  h.fill();
  await h.submit();
  assert.equal(h.disabled, true);
  assert.match(h.status, /expired/);
  assert.equal(h.get("new-password").value, "");
  await h.submit();
  assert.equal(h.calls.length, 1);
});

test("unexpected verification responses cannot change a password", async () => {
  const h = harness({ send: () => response({}) });
  h.fill();
  await h.submit();
  assert.equal(h.disabled, true);
  assert.equal(h.calls.length, 1);
});

for (const errorCode of ["weak_password", "same_password"]) {
  test(`${errorCode} permits a corrected password without reusing the consumed token`, async () => {
    let updates = 0;
    const h = harness({ send: (url) => {
      if (url.endsWith("/verify")) return response({ access_token: "test-recovery-session" });
      if (url.endsWith("/user") && updates++ === 0) return response({ code: errorCode }, 422);
      return response({ id: "test-user" });
    } });
    h.fill();
    await h.submit();
    assert.equal(h.disabled, false);
    assert.match(h.status, errorCode === "weak_password" ? /security requirements/ : /different from/);
    h.fill("A different test passphrase!");
    await h.submit();
    assert.equal(h.calls.filter((call) => call.url.endsWith("/verify")).length, 1);
    assert.match(h.status, /successfully/);
  });
}

test("network errors are retryable and preserve entered passwords", async () => {
  const h = harness({ send: () => { throw new TypeError("network unavailable"); } });
  h.fill();
  await h.submit();
  assert.equal(h.disabled, false);
  assert.match(h.status, /connection/);
  assert.equal(h.get("new-password").value, "A test passphrase 123!");
});

test("rate limits explain the wait without exposing raw provider errors", async () => {
  const h = harness({ send: () => response({ message: "private detail", code: "over_request_rate_limit" }, 429) });
  h.fill();
  await h.submit();
  assert.match(h.status, /Wait a few minutes/);
  assert.doesNotMatch(h.status, /private detail/);
});

test("duplicate submissions are blocked while a request is in flight", async () => {
  let resolveVerify;
  const h = harness({ send: (url) => url.endsWith("/verify") ? new Promise((resolve) => { resolveVerify = resolve; }) : response({}) });
  h.fill();
  const pending = h.submit();
  assert.equal(h.disabled, true);
  assert.equal(h.get("[data-reset-fields]").disabled, true);
  await h.submit();
  assert.equal(h.calls.length, 1);
  resolveVerify(response({ access_token: "test-recovery-session" }));
  await pending;
  assert.match(h.status, /successfully/);
});

test("leaving the page aborts pending work and clears recovery credentials", async () => {
  let resolveVerify;
  const h = harness({ send: () => new Promise((resolve) => { resolveVerify = resolve; }) });
  h.fill();
  const pending = h.submit();
  h.windowEvents.pagehide();
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.get("new-password").value, "");
  resolveVerify(response({ access_token: "test-recovery-session" }));
  await pending;
  assert.equal(h.calls.length, 1, "Must not update a password after navigating away");
  assert.equal(h.disabled, true);
});

test("password visibility toggles have accessible labels and pressed states", () => {
  const h = harness();
  h.toggles[0].events.click();
  assert.equal(h.get("new-password").type, "text");
  assert.equal(h.toggles[0].attributes["aria-pressed"], "true");
  assert.match(h.toggles[0].attributes["aria-label"], /Hide/);
  h.toggles[0].events.click();
  assert.equal(h.get("new-password").type, "password");
  assert.equal(h.toggles[0].attributes["aria-pressed"], "false");
});

test("an expired recovery session fails closed during password update", async () => {
  const h = harness({ send: (url) => url.endsWith("/verify")
    ? response({ access_token: "test-recovery-session" })
    : response({ code: "session_expired" }, 401) });
  h.fill();
  await h.submit();
  assert.equal(h.calls.length, 2);
  assert.equal(h.disabled, true);
  assert.match(h.status, /Request a new link/);
  assert.equal(h.get("new-password").value, "");
});

test("a temporary update failure can retry without verifying the single-use token again", async () => {
  let updates = 0;
  const h = harness({ send: (url) => {
    if (url.endsWith("/verify")) return response({ access_token: "test-recovery-session" });
    if (url.endsWith("/user") && updates++ === 0) return response({}, 503);
    return response({});
  } });
  h.fill();
  await h.submit();
  assert.equal(h.disabled, false);
  await h.submit();
  assert.equal(h.calls.filter((call) => call.url.endsWith("/verify")).length, 1);
  assert.match(h.status, /successfully/);
});

test("logout cleanup failure does not misreport a successful password change", async () => {
  const h = harness({ send: (url) => {
    if (url.endsWith("/verify")) return response({ access_token: "test-recovery-session" });
    if (url.includes("/logout")) throw new TypeError("network unavailable");
    return response({});
  } });
  h.fill();
  await h.submit();
  assert.match(h.status, /successfully/);
  h.windowEvents.pagehide();
  assert.match(h.status, /successfully/, "Returning via the back-forward cache should preserve success");
});
