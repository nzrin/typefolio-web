TYPE FOLIO OFFICIAL WEBSITE

A standalone HTML/CSS/JavaScript site with a Cloudflare contact endpoint.
No front-end dependencies. Production packaging uses Python 3.

Preview from the TypeFolio project root:
  python3 -m http.server 8765 --bind 127.0.0.1 --directory web
Then open http://127.0.0.1:8765 in Safari.

Files:
  index.html       Page content, metadata, platform availability
  styles.css       Main dark theme and responsive layouts
  site-pages.css   Shared navigation, hero, reading pages, and contact layouts
  script.js        Tabs, mobile navigation, reading navigation, and footer year
  assets/          Local optimized app screenshots, artwork, and font
  tools/build-pages.py  Source for shared header/footer and support pages

Support routes (each contains index.html):
  contact/, faq/, terms/, privacy/, purchases/, delete-account/, ad-privacy/
All pages use dark mode. Long pages include a table of contents.
After editing shared page content in the generator, run from the project root:
  python3 web/tools/build-pages.py

App Store and Google Play are Coming soon as requested. Replace the platform
availability cards with real store links after release. The contact form uses
Cloudflare Turnstile and a Worker to send support messages through Resend.
The direct email link remains available. No analytics are included.

Favicon and touch icon derive from assets/images/icon_solo.png in the app project.
Screenshots derive from /Volumes/Development/Assets/TypeFolio/screenshot/Phone.
Rocket and custom-world artwork derive from Store_Screenshots_2026-11-03_v2.
Space Grotesk license is included as assets/FONT-LICENSE.txt.

The previous Flutter web index and manifest are preserved in flutter-original/.
They are templates, not a separately runnable Flutter build. The root index now
serves the marketing website. For a future Flutter web app build, use the
preserved launcher in a separate build configuration or restore it first.
Deploy with the Cloudflare instructions below; no flutter build is needed.
The packaging script excludes source, tests, local secrets, and Flutter templates.
Set og:image to the final absolute website URL when the production domain is known.

Verification: JavaScript syntax; all local HTML asset references and anchor IDs;
Safari desktop and responsive phone (390 px) and tablet (768 px) previews;
feature tabs, difficulty tabs, FAQ disclosure, and Coming soon anchor navigation.
Updated navigation and Terms layout checked in Safari desktop and at 390 px;
mobile menu route navigation, Contact email targets, and Terms section jumps
verified. All eight pages' local links, assets, and fragments validated.


CONTACT FORM — CLOUDFLARE SETUP

Implemented locally, not deployed. A real Turnstile challenge and delivery still
need production credentials and an authorized test. Supabase SMTP settings do
not automatically configure the website; add the website variables separately.

1. Cloudflare > Turnstile > Add widget:
   Name: Type Folio contact
   Hostname: typefolioapp.nazrin.codes
   Mode: Managed. Pre-clearance is not needed.

2. Workers & Pages > your website > Settings > Variables and Secrets:

   TURNSTILE_SITE_KEY       Text    Public site key from this widget
   TURNSTILE_SECRET_KEY     Secret  Secret key from the SAME widget
   RESEND_API_KEY           Secret  Sending-access key for auth.typefolioapp.nazrin.codes
   CONTACT_FROM_EMAIL       Text    noreply@auth.typefolioapp.nazrin.codes
   CONTACT_ALLOWED_HOSTNAMES Text   typefolioapp.nazrin.codes

   Add the keys directly in Cloudflare, never in the repository or chat.
   The site key is returned by GET /api/contact; secrets stay on the server.
   The contact form stays disabled until required configuration is present.
   Configuration readiness is not proof that keys are valid or mail is delivered.

3. The recipient is fixed to support@typefolioapp.nazrin.codes. Ensure this address
   has a working inbox or forwarding route. Resend outbound SMTP does not create
   a receiving mailbox. Visitor email is only Reply-To, never the sender.

4. Deploy using your EXISTING project type (do not create a second project):

   Cloudflare Pages (the typefolio-web project observed in Safari):
     Repository root: the web repository
     Build command: python3 tools/build-deploy.py --pages
     Build output directory: dist
     Set variables/secrets in Production, then redeploy.
     This includes _worker.js and _routes.json for Pages advanced mode.

   Standalone Cloudflare Worker:
     The worker name in wrangler.worker.jsonc must match the existing Worker.
     From web/, deploy with:
       npx wrangler deploy --config wrangler.worker.jsonc
     The configured build command packages public files into dist/ automatically.
     Configure TURNSTILE_SITE_KEY in vars in wrangler.worker.jsonc before CLI
     deployment; dashboard-only plaintext vars can be overwritten by Wrangler.
     Keep TURNSTILE_SECRET_KEY and RESEND_API_KEY as Cloudflare secrets.
     Keep the existing typefolioapp.nazrin.codes domain attached to this Worker.

   Only /api/contact invokes the Worker; other paths serve static files.
   For a preview hostname, add that EXACT hostname to the Turnstile widget and
   CONTACT_ALLOWED_HOSTNAMES (comma-separated); no broad hostname wildcards.

5. Visit /contact/, complete verification, and send an authorized test message.
   Check Resend delivery and the support inbox, then confirm Reply replies to the
   visitor address. A success message means Resend accepted the email, not that
   inbox delivery has been confirmed. Expired/used tokens require a fresh check.

LOCAL CHECKS (no real keys or email sends)
  node tests/contact-worker.test.mjs
  node tests/contact.test.mjs
  python3 tools/build-deploy.py --pages

Static Python preview cannot run /api/contact. It intentionally shows the email
fallback and disabled submit. To run the endpoint locally use Wrangler with
local-only test keys and an allowed localhost hostname. Never deploy test keys.

Implementation:
  tools/contact-form.html  Form markup, preserved by build-pages.py
  contact.js               Accessible sending, expiry, errors, retry handling
  _worker.js               Validation, Turnstile Siteverify, Resend delivery
  _routes.json             Pages function route
  wrangler.worker.jsonc    Standalone Worker configuration
  tools/build-deploy.py    Public-file allowlist and optional Pages packaging
  tests/                   Mocked upstream and frontend regression checks

Server validation checks hostname, action, same-origin POST, content type, body
size, input lengths and honeypot. Email is plain text with a fixed recipient.
Idempotency keys prevent duplicate sends on unchanged retries within Resend's
24-hour idempotency window. No form fields or credentials are logged by this code.

References:
https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
https://developers.cloudflare.com/pages/functions/advanced-mode/
https://resend.com/docs/api-reference/emails/send-email


PASSWORD RECOVERY — /reset (reset.html)

The browser flow mirrors Grid Folio and uses Type Folio's Supabase project.
The app can keep its existing resetPasswordForEmail call and app redirect.
The custom Reset Password email links directly to this page with TokenHash;
there is no device-local PKCE verifier dependency for this recovery flow.

1. Deploy the updated web package first. It now includes reset.html, reset.js,
   reset.css and _headers. Cloudflare serves reset.html at /reset.
2. Supabase > Authentication > Emails > Reset password > Source:
   Use tools/email-templates/reset.html, or set your existing button href to:
   https://typefolioapp.nazrin.codes/reset?token_hash={{ .TokenHash }}&amp;type=recovery
   Suggested subject: Reset your Type Folio password
   Use TokenHash directly; ConfirmationURL consumes the token before this page.
3. Request a NEW reset email from the app and open it in a browser. Choose and
   confirm a new password, then return to the app and sign in. Old emails are
   not rewritten by changing the template. Disable email click tracking.

The page removes recovery parameters from the address bar before loading other
resources. Tokens remain in memory only. Verification happens when the visitor
submits matching passwords, so loading the page does not consume the token.
After updating the password, it clears fields and attempts to revoke the
short-lived recovery session. No service-role key or persistent web login is used.
Expired, missing or invalid tokens show instructions for requesting a fresh link.
The page requires at least eight characters; Supabase enforces its password policy.

The supplied email template is source-only and excluded from public packaging.
The shared page generator preserves reset content from tools/reset-content.html.
No live password was changed during development. Safari showed the saved Reset
Password template using the matching Type Folio TokenHash URL. Website deployment
and an end-to-end password reset still need verification before release.

Checks: node --test tests/reset.test.mjs (mocked Supabase, no account changes).
Reference: https://supabase.com/docs/guides/auth/auth-email-templates
