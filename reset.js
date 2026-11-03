(() => {
  "use strict";
  // Public client credentials, matching lib/auth/config/supabase_config.dart.
  // Never replace this with a service-role or secret key.
  const authUrl = "https://gfsowksgljsvhjjfsill.supabase.co/auth/v1";
  const apiKey = "sb_publishable_trgEehAA7LlcyuZJSGnzzA_SpTS0bp7";
  const invalidLink = "This reset link is missing, invalid, or has expired. Request a new link from Forgot password in the Type Folio app.";
  let tokenHash = "";
  let accessToken = "";
  let busy = false;
  let finished = false;
  let abandoned = false;
  let controller;
  try {
    const link = new URL(window.location.href);
    const hash = link.searchParams.get("token_hash") || "";
    if (link.searchParams.getAll("token_hash").length === 1 &&
        link.searchParams.getAll("type").length === 1 &&
        link.searchParams.get("type") === "recovery" &&
        !link.searchParams.has("error") && !link.hash &&
        /^[A-Za-z0-9_-]{20,2048}$/.test(hash)) tokenHash = hash;
    // No tokens in history, storage, subsequent requests, or outgoing links.
    window.history.replaceState(null, "", "/reset");
  } catch {
    tokenHash = "";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("[data-reset-form]");
    const fields = document.querySelector("[data-reset-fields]");
    const submit = document.querySelector("[data-reset-submit]");
    const status = document.getElementById("reset-status");
    const password = document.getElementById("new-password");
    const confirmation = document.getElementById("confirm-password");
    const title = document.getElementById("reset-title");
    const description = document.querySelector("[data-reset-description]");
    const help = document.querySelector("[data-reset-help]");
    const success = document.querySelector("[data-reset-success]");
    if (!form) return;

    function message(text, state = "info") {
      status.textContent = text;
      status.dataset.state = state;
    }
    function controls() {
      const disabled = busy || finished || abandoned || !(tokenHash || accessToken);
      fields.disabled = disabled;
      submit.disabled = disabled;
      submit.textContent = busy ? "Resetting password…" : "Reset password";
      form.setAttribute("aria-busy", String(busy));
    }
    function invalidate() {
      tokenHash = "";
      accessToken = "";
      form.reset();
      message(invalidLink, "error");
    }
    // Verify only after a deliberate submission, never on load: mail scanners
    // must not consume the single-use recovery link.
    async function request(path, method, body, bearer = "") {
      const activeController = new AbortController();
      controller = activeController;
      const timer = setTimeout(() => activeController.abort(), 15000);
      try {
        const response = await fetch(authUrl + path, {
          method,
          headers: { apikey: apiKey, "Content-Type": "application/json", ...(bearer ? { Authorization: "Bearer " + bearer } : {}) },
          body: JSON.stringify(body),
          credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
          signal: activeController.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error("Authentication request failed");
          error.status = response.status;
          error.code = data?.code || data?.error_code;
          throw error;
        }
        return data;
      } finally {
        clearTimeout(timer);
        if (controller === activeController) controller = undefined;
      }
    }

    for (const toggle of document.querySelectorAll("[data-password-toggle]")) {
      const input = document.getElementById(toggle.dataset.passwordToggle);
      const label = toggle.getAttribute("aria-label");
      toggle.addEventListener("click", () => {
        const visible = input.type === "password";
        input.type = visible ? "text" : "password";
        toggle.textContent = visible ? "Hide" : "Show";
        toggle.setAttribute("aria-pressed", String(visible));
        toggle.setAttribute("aria-label", visible ? label.replace("Show", "Hide") : label);
      });
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || finished || abandoned || !(tokenHash || accessToken)) return;
      password.removeAttribute("aria-invalid");
      confirmation.removeAttribute("aria-invalid");
      if (password.value.length < 8) {
        message("Use at least 8 characters for your new password.", "error");
        password.setAttribute("aria-invalid", "true");
        password.focus();
        return;
      }
      if (password.value !== confirmation.value) {
        message("Your passwords don’t match. Please enter the same password in both fields.", "error");
        confirmation.setAttribute("aria-invalid", "true");
        confirmation.focus();
        return;
      }
      busy = true;
      controls();
      message("Updating your password…");
      let verifying = !accessToken;
      let focusPassword = false;
      try {
        if (verifying) {
          const data = await request("/verify", "POST", { token_hash: tokenHash, type: "recovery" });
          if (abandoned) return;
          if (typeof data?.access_token !== "string" || !data.access_token) {
            invalidate();
            return;
          }
          accessToken = data.access_token;
          tokenHash = "";
        }
        verifying = false;
        await request("/user", "PUT", { password: password.value }, accessToken);
        if (abandoned) return;
        // Best-effort revoke only this temporary recovery session. Never save
        // its refresh token or sign the visitor in persistently on the website.
        const recoverySession = accessToken;
        accessToken = "";
        tokenHash = "";
        finished = true;
        form.reset();
        form.hidden = true;
        help.hidden = true;
        success.hidden = false;
        title.textContent = "Password updated.";
        description.textContent = "You’re all set. Return to Type Folio and sign in with your new password.";
        message("Your password has been reset successfully.", "success");
        title.focus();
        void request("/logout?scope=local", "POST", {}, recoverySession).catch(() => {});
      } catch (error) {
        if (abandoned) return;
        if (error.status === 429) {
          message("Too many attempts. Wait a few minutes before trying again.", "error");
        } else if ((verifying && [400, 401, 403, 422].includes(error.status)) ||
                   ["otp_expired", "session_not_found", "session_expired", "bad_jwt"].includes(error.code) ||
                   error.status === 401 || error.status === 403) {
          invalidate();
        } else if (error.code === "same_password") {
          message("Choose a password that is different from your current password.", "error");
          focusPassword = true;
        } else if (error.code === "weak_password") {
          message("This password doesn’t meet the security requirements. Try a longer, unique password with uppercase and lowercase letters, numbers, and symbols.", "error");
          focusPassword = true;
        } else {
          message("We couldn’t confirm the password change. Check your connection and try again. If the link has expired, request a new one in the app.", "error");
        }
      } finally {
        busy = false;
        controls();
        if (focusPassword && !fields.disabled) password.focus();
      }
    });

    window.addEventListener("pagehide", () => {
      abandoned = true;
      controller?.abort();
      if (!finished) invalidate();
      controls();
    });
    message(tokenHash ? "Enter and confirm your new password to continue." : invalidLink, tokenHash ? "info" : "error");
    controls();
  });
})();
