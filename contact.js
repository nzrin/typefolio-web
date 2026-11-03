/* Public site key only. Tokens are verified by /api/contact, never trusted here. */
(() => {
  'use strict';
  const form = document.querySelector('#contact-form');
  if (!form) return;
  const get = (id) => document.querySelector(`#contact-${id}`);
  const button = get('submit');
  const buttonLabel = get('submit-label');
  const status = get('status');
  const verificationStatus = get('verification-status');
  const deliveryNote = get('delivery-note');
  const retryButton = get('retry');
  const fields = ['name', 'email', 'topic', 'message', 'website'].map(get);
  const [nameField, emailField, topicField, messageField, trapField] = fields;
  const topics = new Set(['General question', 'Bug report', 'Feature idea', 'Privacy or terms']);
  const endpoint = form.dataset.contactEndpoint;
  let sitekey = '';
  let token = '';
  let widgetId = null;
  let busy = false;
  let ready = false;
  let started = false;
  let loadingScript = false;
  let scriptElement = null;
  let scriptTimeout;
  let widgetSize = '';
  let previousPayload = '';
  let submissionId = '';

  function updateButton() {
    button.disabled = busy || !ready || !token;
    buttonLabel.textContent = busy ? 'Sending…' : 'Send message';
    form.setAttribute('aria-busy', String(busy));
  }
  function verificationFailed(message) {
    token = '';
    verificationStatus.textContent = message;
    retryButton.hidden = false;
    updateButton();
  }
  function renderWidget() {
    clearTimeout(scriptTimeout);
    loadingScript = false;
    if (widgetId !== null) return;
    widgetSize = get('turnstile').clientWidth < 300 ? 'compact' : 'flexible';
    try {
      widgetId = window.turnstile.render('#contact-turnstile', {
        sitekey,
        action: 'contact', theme: 'dark', size: widgetSize,
        'response-field': false,
        'refresh-expired': 'auto',
        callback(value) {
          token = value;
          verificationStatus.textContent = 'Verification complete.';
          retryButton.hidden = true;
          updateButton();
        },
        'expired-callback'() {
          verificationFailed('Verification expired. Please complete the check again.');
        },
        'timeout-callback'() {
          verificationFailed('Verification timed out. Please try again.');
        },
        'error-callback'() {
          verificationFailed('Verification could not load. Check your connection or content blocker, then retry.');
        },
        'unsupported-callback'() {
          verificationFailed('This browser cannot complete verification. Please try an updated browser.');
        },
      });
    } catch {
      verificationFailed('Verification is unavailable. Please retry.');
    }
  }
  window.typeFolioTurnstileReady = renderWidget;
  function loadWidget() {
    if (window.turnstile?.render) { renderWidget(); return; }
    if (loadingScript) return;
    loadingScript = true;
    verificationStatus.textContent = 'Loading spam protection…';
    scriptElement?.remove();
    scriptElement = document.createElement('script');
    scriptElement.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=typeFolioTurnstileReady&render=explicit';
    scriptElement.async = true;
    scriptElement.onerror = () => {
      clearTimeout(scriptTimeout);
      loadingScript = false;
      verificationFailed('Spam protection could not load. Check your connection or content blocker, then retry.');
    };
    document.head.append(scriptElement);
    scriptTimeout = setTimeout(() => {
      loadingScript = false;
      verificationFailed('Spam protection is taking too long to load. Please retry.');
    }, 15000);
  }
  function resizeWidget() {
    const size = get('turnstile').clientWidth < 300 ? 'compact' : 'flexible';
    if (busy || widgetId === null || size === widgetSize) return;
    token = '';
    updateButton();
    try {
      window.turnstile.remove(widgetId);
      widgetId = null;
      renderWidget();
    } catch { verificationFailed('Please reload this page to refresh verification.'); }
  }
  if ('ResizeObserver' in window) new ResizeObserver(resizeWidget).observe(get('turnstile'));
  async function requestJSON(options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(endpoint, {
        ...options, cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
      });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Service unavailable');
      return { response, data: await response.json() };
    } finally { clearTimeout(timeout); }
  }
  async function checkAvailability() {
    try {
      const { response, data } = await requestJSON();
      ready = response.ok && data.ready === true && typeof data.sitekey === 'string' && Boolean(data.sitekey);
      sitekey = ready ? data.sitekey : '';
      deliveryNote.textContent = ready
        ? 'Sends to support@typefolioapp.nazrin.codes. We only receive your message when you submit it.'
        : 'The contact form is temporarily unavailable. Please retry or email us directly.';
    } catch {
      ready = false;
      deliveryNote.textContent = 'The contact service is unavailable. Your message stays here; please try again later.';
    }
    if (ready) loadWidget();
    else {
      verificationStatus.textContent = 'Please retry or use the email link below.';
      retryButton.hidden = false;
    }
    updateButton();
  }
  function start() {
    if (started) return;
    started = true;
    void checkAvailability();
  }
  retryButton.addEventListener('click', () => {
    token = '';
    retryButton.hidden = true;
    verificationStatus.textContent = 'Checking again…';
    updateButton();
    if (widgetId !== null) {
      try { window.turnstile.reset(widgetId); }
      catch { verificationFailed('Verification is unavailable. Please reload this page.'); }
    }
    void checkAvailability();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    emailField.value = emailField.value.trim();
    messageField.setCustomValidity(messageField.value.trim().length < 10 ? 'Please enter at least 10 characters for your message.' : '');
    if (!form.reportValidity() || !topics.has(topicField.value)) return;
    if (!ready) { status.textContent = 'The contact service is not ready. Nothing has been sent.'; return; }
    if (!token) { status.textContent = 'Please complete the spam-protection check first.'; return; }
    const payload = {
      name: nameField.value.trim(), email: emailField.value,
      topic: topicField.value, message: messageField.value.trim(), website: trapField.value,
    };
    status.dataset.state = '';
    const fingerprint = JSON.stringify(payload);
    if (fingerprint !== previousPayload || !submissionId) {
      submissionId = window.crypto.randomUUID();
      previousPayload = fingerprint;
    }
    busy = true;
    fields.forEach((field) => { field.disabled = true; });
    retryButton.disabled = true;
    status.textContent = 'Verifying and sending your message…';
    updateButton();
    try {
      const { response, data } = await requestJSON({
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, token, submissionId }),
      });
      if (response.ok && data.ok === true) {
        form.reset();
        previousPayload = '';
        submissionId = '';
        status.dataset.state = 'success';
        status.textContent = 'Thank you! Your message has been submitted to our email service.';
      } else {
        status.dataset.state = 'error';
        const messages = {
          invalid_input: 'Please check your email and message, then try again.',
          verification_failed: 'Verification failed or expired. Please complete the new check and try again.',
          verification_unavailable: 'Spam protection is temporarily unavailable. Please try again shortly.',
          not_configured: 'The contact form is temporarily unavailable. Please retry or email us directly.',
          send_failed: 'The email service could not accept your message. Please try again shortly.',
          send_unconfirmed: 'We could not confirm submission. Your message is still here; retrying the same message will not intentionally send a duplicate.',
        };
        status.textContent = messages[data.code] || 'Your message could not be submitted. Please try again later.';
      }
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'We could not confirm submission. Your message is still here; check your connection and try again.';
    } finally {
      token = '';
      busy = false;
      fields.forEach((field) => { field.disabled = false; });
      retryButton.disabled = false;
      updateButton();
      verificationStatus.textContent = 'Refreshing verification for your next message…';
      try { window.turnstile.reset(widgetId); }
      catch { verificationFailed('Please retry verification before sending another message.'); }
      resizeWidget();
    }
  });
  fields.forEach((field) => field.addEventListener('input', () => {
    messageField.setCustomValidity('');
    if (!busy) status.textContent = '';
  }));
  button.type = 'submit';
  updateButton();
  // Do not load the third-party widget until the contact form is approached.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); start(); }
    }, { rootMargin: '300px' });
    observer.observe(form);
    form.addEventListener('focusin', start, { once: true });
  } else { start(); }
})();
