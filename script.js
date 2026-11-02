'use strict';
const previews = {
  expedition: {screen: 1, alt: 'Expedition overview with Solara and other planets', copy: 'Start in Solara. Discover new planets, collect stars, and find your rhythm among the words.'},
  journey: {screen: 2, alt: 'Solara level journey with a winding path and earned stars', copy: 'One orbit leads to the next. Follow your path, revisit a challenge, and reach for another star.'},
  spaces: {screen: 6, alt: 'Explore showing a custom Favourite Words space', copy: 'Your vocabulary, your universe. Create personal word collections and turn them into a new challenge.'},
  growth: {screen: 8, alt: 'Profile Growth with completed missions and achievements', copy: 'Every mission adds to your story. Keep track of the milestones, records, and achievements along the way.'}
};
const difficulties = {
  easy: ['FIND YOUR RHYTHM', 'MOON', 'A softer start. Shorter words and room to get into your groove.'],
  medium: ['TURN UP THE PACE', 'PLANET', 'A little more speed. A little more focus. Find the sweet spot between comfort and challenge.'],
  hard: ['GO FULL THROTTLE', 'SUPERNOVA', 'Longer words. A faster fall. Bring your sharpest focus and make every keystroke count.']
};
function wireTabs(selector, onSelect) {
  const tabs = [...document.querySelectorAll(selector)];
  function activate(tab) {
    tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; });
    onSelect(tab);
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = (index + 1) % tabs.length;
      if (['ArrowLeft', 'ArrowUp'].includes(event.key)) next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault(); activate(tabs[next]); tabs[next].focus();
    });
  });
}
wireTabs('[data-preview]', tab => {
  const data = previews[tab.dataset.preview];
  const screen = document.getElementById('preview-screen');
  screen.src = `assets/screen-${data.screen}.webp`; screen.alt = data.alt;
  document.getElementById('preview-description').textContent = data.copy;
  document.getElementById('preview-panel').setAttribute('aria-labelledby', tab.id);
});
wireTabs('[data-difficulty]', tab => {
  const data = difficulties[tab.dataset.difficulty];
  ['difficulty-label', 'difficulty-word', 'difficulty-copy'].forEach((id, index) => { document.getElementById(id).textContent = data[index]; });
  document.getElementById('difficulty-panel').setAttribute('aria-labelledby', tab.id);
});
document.getElementById('year').textContent = new Date().getFullYear();

// Shared navigation works on every static page, including keyboard-only use.
const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.getElementById('main-nav');
// Preserve a selected pill on the home page, including direct anchor visits
// and browser back/forward navigation. Subpages use their rendered page state.
const sectionLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];
if (sectionLinks.length) {
  function selectSection(link) {
    sectionLinks.forEach(item => {
      item.classList.toggle('active', item === link);
      if (item === link) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    });
  }
  function selectFromHash() {
    const match = sectionLinks.find(link => link.hash === window.location.hash);
    if (match) selectSection(match);
    else if (!window.location.hash || window.location.hash === '#top') selectSection(sectionLinks[0]);
  }
  sectionLinks.forEach(link => link.addEventListener('click', () => selectSection(link)));
  window.addEventListener('hashchange', selectFromHash);
  selectFromHash();
}
if (menuToggle && mainNav) {
  function closeMenu(returnFocus = false) {
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
    mainNav.classList.remove('is-open');
    if (returnFocus) menuToggle.focus();
  }
  menuToggle.addEventListener('click', () => {
    const opening = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(opening));
    menuToggle.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
    mainNav.classList.toggle('is-open', opening);
  });
  mainNav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header')) closeMenu();
  });
  const mobileMenu = window.matchMedia('(max-width: 640px)');
  mobileMenu.addEventListener('change', () => closeMenu());
}
// Highlight the current reading section without replacing native anchor behavior.
const readingLinks = [...document.querySelectorAll('.legal-toc a')];
if (readingLinks.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!visible) return;
    readingLinks.forEach(link => {
      if (link.hash === `#${visible.target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, {rootMargin: '-5% 0px -65% 0px', threshold: 0});
  document.querySelectorAll('.legal-content section').forEach(section => observer.observe(section));
}
