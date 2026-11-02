TYPE FOLIO OFFICIAL WEBSITE

A standalone HTML/CSS/JavaScript site. No package installation or build required.

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
availability cards with real store links after release. Contact links open the
visitor's email app addressed to support@typefolioapp.nazrin.codes. No contact
form backend, analytics, or third-party page assets are included.

Favicon and touch icon derive from assets/images/icon_solo.png in the app project.
Screenshots derive from /Volumes/Development/Assets/TypeFolio/screenshot/Phone.
Rocket and custom-world artwork derive from Store_Screenshots_2026-11-03_v2.
Space Grotesk license is included as assets/FONT-LICENSE.txt.

The previous Flutter web index and manifest are preserved in flutter-original/.
They are templates, not a separately runnable Flutter build. The root index now
serves the marketing website. For a future Flutter web app build, use the
preserved launcher in a separate build configuration or restore it first.
Deploy the marketing files directly to a static host; no flutter build is needed.
Exclude tools/, flutter-original/, README.txt, and unused icons/ from deployment.
Set og:image to the final absolute website URL when the production domain is known.

Verification: JavaScript syntax; all local HTML asset references and anchor IDs;
Safari desktop and responsive phone (390 px) and tablet (768 px) previews;
feature tabs, difficulty tabs, FAQ disclosure, and Coming soon anchor navigation.
Updated navigation and Terms layout checked in Safari desktop and at 390 px;
mobile menu route navigation, Contact email targets, and Terms section jumps
verified. All eight pages' local links, assets, and fragments validated.
