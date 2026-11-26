// Kelvara landing page behaviour. Every figure here is simulated (concept project by Numinae).
import { startLattice } from './lattice.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pad = (n) => String(n).padStart(2, '0');
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── live-looking launch figures ── */
function startData() {
  const CAP = 25_000_000;
  const TARGET = Date.UTC(2027, 0, 15, 12, 0, 0);
  let raised = 18_412_640, people = 48_217, settled = 1_284_903;
  const tps = Array.from({ length: 48 }, (_, i) => 14 + Math.sin(i / 4) * 3 + Math.random() * 3);

  function set(sel, v, flash = true) {
    $$(sel).forEach((e) => {
      if (e.textContent === v) return;
      e.textContent = v;
      if (!flash) return;
      e.classList.remove('tick');
      void e.offsetWidth;
      e.classList.add('tick');
    });
  }
  function buy() {
    if (Math.random() < 0.6) {
      raised = Math.min(CAP, raised + [50, 100, 250, 250, 500, 1000, 2500][Math.floor(Math.random() * 7)]);
      set('[data-raised]', fmt(raised));
      const pct = (raised / CAP) * 100;
      set('[data-raised-pct]', pct.toFixed(1), false);
      $$('[data-raised-bar]').forEach((b) => { b.style.width = pct.toFixed(2) + '%'; });
      if (Math.random() < 0.45) { people += 1; set('[data-participants]', fmt(people)); }
    }
  }
  function net() {
    const now = 12 + Math.random() * 9;
    tps.push(now); tps.shift();
    settled += Math.round(now);
    set('[data-settled]', fmt(settled));
    const lo = Math.min(...tps), hi = Math.max(...tps);
    const pts = tps.map((v, i) => `${((i / (tps.length - 1)) * 100).toFixed(1)},${(26 - ((v - lo) / (hi - lo || 1)) * 22).toFixed(1)}`).join(' ');
    $$('[data-spark] polyline').forEach((p) => p.setAttribute('points', pts));
  }
  function clock() {
    let s = Math.max(0, Math.floor((TARGET - Date.now()) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    set('[data-cd-d]', String(d), false);
    set('[data-cd-h]', pad(h), false);
    set('[data-cd-m]', pad(m), false);
    set('[data-cd-s]', pad(s), false);
  }
  buy(); net(); clock();
  setInterval(buy, 1300);
  setInterval(net, 1000);
  setInterval(clock, 1000);
}

/* ── settlement feed ── */
function startFeed() {
  const track = $('[data-feed]');
  if (!track) return;
  const kinds = ['DRONE', 'ROVER', 'CHARGER', 'GATE', 'AGENT', 'VAN', 'METER', 'DOCK', 'SENSOR', 'ARM', 'KIOSK', 'LOCKER'];
  const id = () => `${kinds[Math.floor(Math.random() * kinds.length)]}-${pad(1 + Math.floor(Math.random() * 98))}`;
  const items = Array.from({ length: 16 }, () => {
    const amt = (0.02 + Math.random() * Math.random() * 6).toFixed(2);
    const ms = 300 + Math.floor(Math.random() * 240);
    return `<span class="feed-item">${id()} → ${id()} <b>${amt} USDT</b> <i>${ms} ms</i></span>`;
  }).join('');
  track.innerHTML = items + items;
}

/* ── reveals, counters, nav state ── */
function startReveals() {
  $$('[data-reveal="clip"]').forEach((h) => { h.innerHTML = `<span class="ln">${h.innerHTML}</span>`; });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      $$('[data-count]', e.target).forEach(count);
      io.unobserve(e.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal]').forEach((el) => io.observe(el));
}
function count(el) {
  if (el.dataset.done) return;
  el.dataset.done = '1';
  const end = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
  const show = (v) => { el.textContent = dec ? v.toFixed(dec) : fmt(v); };
  if (still) { show(end); return; }
  const t0 = performance.now(), dur = 1600;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    show(end * (1 - Math.pow(1 - k, 4)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function startScroll() {
  const nav = $('.nav');
  const links = $$('.nav nav a');
  const secs = links.map((a) => $(a.getAttribute('href')));
  const onScroll = () => {
    const y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    document.documentElement.style.setProperty('--scroll', max > 0 ? (y / max).toFixed(4) : 0);
    nav.classList.toggle('stuck', y > 24);
    let cur = -1;
    secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < window.innerHeight * 0.4) cur = i; });
    links.forEach((a, i) => a.classList.toggle('on', i === cur));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ── card tilt and cursor glow ── */
function startTilt() {
  $$('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      if (card.hasAttribute('data-tilt') && e.pointerType === 'mouse' && !still) {
        card.style.setProperty('--ry', ((x - 0.5) * 5).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - y) * 5).toFixed(2) + 'deg');
      }
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });
}

/* ── latency bars ── */
function startBars() {
  const el = $('.viz.bars');
  if (!el) return;
  const n = 30;
  el.innerHTML = Array.from({ length: n }, (_, i) => {
    const x = (i - n * 0.38) / (n * 0.2);
    const h = 16 + 84 * Math.exp(-x * x);
    return `<i class="${Math.abs(i - Math.round(n * 0.38)) < 2 ? 'hot' : ''}" style="--h:${h.toFixed(0)};--d:${(Math.random() * 2.4).toFixed(2)}"></i>`;
  }).join('');
}

/* ── how it works: step follows scroll ── */
function startHow() {
  const visual = $('.how-visual');
  const steps = $$('[data-how]');
  if (!visual || !steps.length) return;
  const streams = $$('[data-stream]');
  const svg = $('svg', visual);
  const narrow = window.matchMedia('(max-width:820px)');
  const frame = () => svg.setAttribute('viewBox', narrow.matches ? '40 100 480 256' : '0 0 560 400');
  narrow.addEventListener('change', frame);
  frame();
  let amount = 0.42;
  setInterval(() => {
    if (visual.dataset.step !== '2') return;
    amount += 0.01 + Math.random() * 0.02;
    if (amount > 9.99) amount = 0.42;
    streams.forEach((s) => { s.textContent = amount.toFixed(2); });
  }, 420);
  const pick = () => {
    const mid = window.innerHeight * 0.55;
    let cur = 0;
    steps.forEach((li, i) => { if (li.getBoundingClientRect().top < mid) cur = i; });
    steps.forEach((li, i) => li.classList.toggle('on', i === cur));
    visual.dataset.step = String(cur + 1);
    const r = visual.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.8 && r.bottom > 0) visual.classList.add('wired');
  };
  window.addEventListener('scroll', pick, { passive: true });
  window.addEventListener('resize', pick);
  pick();
}

startData();
startFeed();
startBars();
startReveals();
startScroll();
startTilt();
startHow();
const gl = $('#gl');
if (gl) startLattice(gl);
