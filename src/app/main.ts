// Kelvara Mini App · concept project by Numinae.
// Demo mode needs no wallet and moves nothing. Testnet mode talks to TON testnet only.
import { Address, beginCell } from '@ton/core';
import {
  contracts, faucetMessages, payMessages, claimMessages, usdtWalletOf, kvraWalletOf,
  friendly, kvraFor, Kit, USDT_UNIT, KVRA_UNIT, FAUCET_AMOUNT, TcMessage,
} from './chain';

/* ───────────── constants ───────────── */
const BOT = 'KelvaraLaunchBot';
const APP_LINK = `https://t.me/${BOT}/app`;
const MANIFEST = 'https://numinae.github.io/kelvara-launch-kit/app/tonconnect-manifest.json';
const TONCENTER = 'https://testnet.toncenter.com/api';
const EXPLORER = 'https://testnet.tonviewer.com/';
const LAUNCH = Date.UTC(2027, 0, 15, 12, 0, 0);
const CAP = 25_000_000;
const PRICE = 0.08;

type Mode = 'demo' | 'testnet';
type Tab = 'presale' | 'allocation' | 'activity' | 'stake' | 'invite';
type Screen = null | 'connect' | 'faucet' | 'buy' | 'claim';
type Kind = 'faucet' | 'pay' | 'claim';
type Act = { kind: Kind; amount: number; at: number; ref: string; link?: string };
type Wallet = { address: string; raw?: Address; demo: boolean };

const S = {
  mode: 'demo' as Mode,
  tab: 'presale' as Tab,
  screen: null as Screen,
  wallet: null as Wallet | null,
  usdt: 0, // tUSDT balance
  pending: 0, // KVRA allocated, not yet claimed
  kvra: 0, // KVRA claimed
  paid: 0, // tUSDT paid in total
  amount: 250,
  acts: [] as Act[],
  busy: false,
  raised: 18_412_640,
  people: 48_217,
  stake: 2500,
  relay: 0,
  ref: 'ref_' + Math.random().toString(36).slice(2, 8),
};

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const short = (a: string) => a.slice(0, 4) + '…' + a.slice(-4);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fakeHash = () => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

/* ───────────── Telegram ───────────── */
const tg: any = (window as any).Telegram?.WebApp;
const inTelegram = !!(tg && tg.initData);
function haptic(kind: 'light' | 'success' | 'error' = 'light') {
  try {
    if (!inTelegram) return;
    if (kind === 'light') tg.HapticFeedback.impactOccurred('light');
    else tg.HapticFeedback.notificationOccurred(kind);
  } catch { /* older clients */ }
}
if (inTelegram) {
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.('#0b0c0e');
    tg.setBackgroundColor?.('#0b0c0e');
    tg.BackButton.onClick(() => back());
    const sp = tg.initDataUnsafe?.start_param;
    if (typeof sp === 'string' && sp.startsWith('ref_')) S.ref = sp;
  } catch { /* ignore */ }
}
document.documentElement.classList.toggle('in-tg', inTelegram);

/* ───────────── storage (demo only) ───────────── */
const KEY = 'kelvara-demo-v1';
function save() {
  if (S.mode !== 'demo') return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ wallet: S.wallet, usdt: S.usdt, pending: S.pending, kvra: S.kvra, paid: S.paid, acts: S.acts }));
  } catch { /* private mode */ }
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d) Object.assign(S, d);
  } catch { /* ignore */ }
}
function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  Object.assign(S, { wallet: null, usdt: 0, pending: 0, kvra: 0, paid: 0, acts: [], screen: null, tab: 'presale' });
  render();
  toast('Demo reset');
}

/* ───────────── TON Connect (loaded only for testnet mode) ───────────── */
let tc: any = null;
let kit: Kit | null = null;
async function tonConnect() {
  if (tc) return tc;
  const { TonConnectUI, THEME } = await import('@tonconnect/ui');
  tc = new TonConnectUI({ manifestUrl: MANIFEST });
  tc.uiOptions = {
    uiPreferences: { theme: THEME.DARK, borderRadius: 'm', colorsSet: { [THEME.DARK]: { accent: '#ffb224', connectButton: { background: '#ffb224', foreground: '#141005' } } } },
    actionsConfiguration: { twaReturnUrl: APP_LINK as `${string}://${string}` },
  };
  tc.onStatusChange((w: any) => {
    if (!w) { if (S.mode === 'testnet') { S.wallet = null; render(); } return; }
    if (w.account.chain !== '-3') {
      toast('That wallet is on mainnet. Switch to a testnet account.', true);
      tc.disconnect();
      return;
    }
    const raw = Address.parse(w.account.address);
    S.wallet = { address: raw.toString({ testOnly: true, bounceable: false }), raw, demo: false };
    if (S.screen === 'connect') S.screen = null;
    render();
    refresh();
  });
  return tc;
}
async function getKit() {
  if (!kit) kit = await contracts();
  return kit;
}

/* ───────────── testnet reads ───────────── */
async function jettonBalance(wallet: Address): Promise<bigint> {
  const r = await fetch(`${TONCENTER}/v2/runGetMethod`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: wallet.toString(), method: 'get_wallet_data', stack: [] }),
  }).then((x) => x.json());
  if (!r.ok || r.result.exit_code !== 0) return 0n; // not deployed yet = zero
  return BigInt(r.result.stack[0][1]);
}
async function allocationOf(owner: Address): Promise<bigint> {
  const k = await getKit();
  const arg = beginCell().storeAddress(owner).endCell().toBoc().toString('base64');
  const r = await fetch(`${TONCENTER}/v2/runGetMethod`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: k.sale.address.toString(), method: 'allocation', stack: [['tvm.Slice', arg]] }),
  }).then((x) => x.json());
  if (!r.ok || r.result.exit_code !== 0) return 0n;
  return BigInt(r.result.stack[0][1]);
}
async function readChain() {
  const k = await getKit();
  const me = S.wallet!.raw!;
  const [u, p, v] = await Promise.all([
    jettonBalance((await usdtWalletOf(k, me)).address),
    allocationOf(me),
    jettonBalance((await kvraWalletOf(k, me)).address),
  ]);
  return { usdt: Number(u) / Number(USDT_UNIT), pending: Number(p) / Number(KVRA_UNIT), kvra: Number(v) / Number(KVRA_UNIT) };
}
async function refresh() {
  if (S.mode !== 'testnet' || !S.wallet?.raw) return;
  try {
    Object.assign(S, await readChain());
    render();
  } catch {
    toast('Could not reach TON testnet. Try again in a moment.', true);
  }
}

/* ───────────── actions ───────────── */
const STAGES: Record<Kind, [string, string, string]> = {
  faucet: ['Request signed', 'Minting test USDT', 'Test USDT in your wallet'],
  pay: ['Payment signed', 'Sent to the Kelvara sale', 'Allocation recorded'],
  claim: ['Claim signed', 'Minting KVRA', 'KVRA in your wallet'],
};

async function run(kind: Kind) {
  if (S.busy || !S.wallet) return;
  const amount = kind === 'faucet' ? Number(FAUCET_AMOUNT / USDT_UNIT) : kind === 'pay' ? S.amount : S.pending;
  if (kind === 'pay' && (amount <= 0 || amount > S.usdt)) { toast('Not enough test USDT', true); return; }
  if (kind === 'claim' && amount <= 0) return;
  S.busy = true;
  haptic();
  try {
    if (S.wallet.demo) {
      const ok = await demoApprove(kind, amount);
      if (!ok) { S.busy = false; return; }
      await progress(kind, async (step) => { await sleep(900); step(1); await sleep(1100); step(2); await sleep(700); });
      if (kind === 'faucet') S.usdt += amount;
      if (kind === 'pay') { S.usdt -= amount; S.paid += amount; S.pending += amount / PRICE; S.raised += amount; }
      if (kind === 'claim') { S.kvra += S.pending; S.pending = 0; }
      S.acts.unshift({ kind, amount, at: Date.now(), ref: fakeHash() });
      save();
    } else {
      const k = await getKit();
      const me = S.wallet.raw!;
      const q = BigInt(Date.now());
      const msgs: TcMessage[] =
        kind === 'faucet' ? faucetMessages(k)
        : kind === 'pay' ? await payMessages(k, me, BigInt(Math.round(amount * 1e6)), q)
        : claimMessages(k, q);
      const before = await readChain();
      const ui = await tonConnect();
      await ui.sendTransaction({ validUntil: Math.floor(Date.now() / 1000) + 300, network: '-3', messages: msgs });
      await progress(kind, async (step) => {
        step(1);
        const t0 = Date.now();
        while (Date.now() - t0 < 120_000) {
          await sleep(3000);
          const now = await readChain().catch(() => null);
          if (!now) continue;
          const done = kind === 'faucet' ? now.usdt > before.usdt : kind === 'pay' ? now.pending > before.pending : now.kvra > before.kvra;
          if (done) { Object.assign(S, now); step(2); return; }
        }
        throw new Error('slow');
      });
      S.acts.unshift({ kind, amount, at: Date.now(), ref: friendly(me), link: EXPLORER + friendly(me) });
    }
    haptic('success');
    receipt(kind, amount);
  } catch (e: any) {
    haptic('error');
    closeOverlay();
    const msg = String(e?.message || e);
    if (/reject|cancel|declin/i.test(msg)) toast('Cancelled in your wallet');
    else if (msg === 'slow') toast('Still settling on testnet. Check Activity in a minute.', true);
    else toast('Something went wrong. Nothing was charged twice; try again.', true);
  } finally {
    S.busy = false;
    render();
  }
}

/* ───────────── overlays ───────────── */
const overlay = () => $('#overlay');
function closeOverlay() { overlay().innerHTML = ''; overlay().className = ''; }
function openOverlay(html: string, cls = 'sheet') {
  $('#toast').className = '';
  overlay().className = 'show ' + cls;
  overlay().innerHTML = `<div class="scrim" data-close></div><div class="panel">${html}</div>`;
}

function demoApprove(kind: Kind, amount: number): Promise<boolean> {
  const lines: Record<Kind, string> = {
    faucet: `<li><span>Mint</span><b>${fmt(amount)} tUSDT</b></li><li><span>To</span><b>${short(S.wallet!.address)}</b></li>`,
    pay: `<li><span>Send</span><b>${fmt(amount, 2)} tUSDT</b></li><li><span>To</span><b>Kelvara sale</b></li><li><span>You get</span><b class="amber">${fmt(amount / PRICE)} KVRA</b></li>`,
    claim: `<li><span>Claim</span><b class="amber">${fmt(amount)} KVRA</b></li><li><span>From</span><b>Kelvara sale</b></li>`,
  };
  return new Promise((resolve) => {
    openOverlay(`
      <div class="grab"></div>
      <p class="sheet-k">Demo wallet · approve request</p>
      <h3>${kind === 'faucet' ? 'Get test USDT' : kind === 'pay' ? 'Confirm payment' : 'Claim KVRA'}</h3>
      <ul class="kv">${lines[kind]}<li><span>Network fee</span><b>${kind === 'pay' ? '0.11' : '0.03'} TON <em>simulated</em></b></li></ul>
      <p class="sheet-note">This is the demo. No wallet is connected and nothing is sent.</p>
      <div class="row2"><button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>Approve</button></div>`);
    overlay().onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-yes]')) { overlay().onclick = null; resolve(true); }
      else if (t.closest('[data-no],[data-close]')) { overlay().onclick = null; closeOverlay(); resolve(false); }
    };
  });
}

async function progress(kind: Kind, work: (step: (i: number) => void) => Promise<void>) {
  const st = STAGES[kind];
  openOverlay(`
    <div class="prog">
      <div class="orbit"><i></i><i></i><i></i><span class="core"></span></div>
      <h3>${kind === 'faucet' ? 'Getting test USDT' : kind === 'pay' ? 'Settling payment' : 'Claiming KVRA'}</h3>
      <ol class="stages">${st.map((s, i) => `<li data-st="${i}" class="${i === 0 ? 'on' : ''}"><i></i>${s}</li>`).join('')}</ol>
      <p class="sheet-note">${S.mode === 'testnet' ? 'Waiting for TON testnet. This can take up to a minute.' : 'Demo · simulated settlement'}</p>
    </div>`, 'full');
  const step = (i: number) => {
    overlay().querySelectorAll('[data-st]').forEach((li, k) => {
      li.classList.toggle('done', k < i);
      li.classList.toggle('on', k === i);
    });
  };
  await work(step);
  overlay().querySelectorAll('[data-st]').forEach((li) => li.classList.add('done'));
  await sleep(450);
}

function receipt(kind: Kind, amount: number) {
  const ref = S.acts[0]?.ref || '';
  const title = kind === 'faucet' ? `${fmt(amount)} test USDT added` : kind === 'pay' ? `${fmt(amount / PRICE)} KVRA allocated` : `${fmt(amount)} KVRA claimed`;
  const next = kind === 'faucet'
    ? `<button class="btn primary wide" data-go="buy">Buy KVRA</button>`
    : kind === 'pay'
      ? `<button class="btn primary wide" data-go="claim">Claim now</button><button class="btn ghost wide" data-go="home">Done</button>`
      : `<button class="btn primary wide" data-tabgo="stake">See staking preview</button><button class="btn ghost wide" data-go="home">Done</button>`;
  openOverlay(`
    <div class="rcpt">
      <div class="tickmark"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>
      <p class="sheet-k">${S.mode === 'demo' ? 'Demo receipt' : 'Testnet receipt'}</p>
      <h3>${title}</h3>
      <ul class="kv">
        ${kind === 'pay' ? `<li><span>Paid</span><b>${fmt(amount, 2)} tUSDT</b></li><li><span>Price</span><b>${PRICE} tUSDT / KVRA</b></li>` : ''}
        ${kind === 'claim' ? `<li><span>KVRA balance</span><b class="amber">${fmt(S.kvra)}</b></li>` : ''}
        ${kind === 'faucet' ? `<li><span>tUSDT balance</span><b>${fmt(S.usdt, 2)}</b></li>` : ''}
        <li><span>Wallet</span><b>${short(S.wallet!.address)}</b></li>
        <li><span>${S.mode === 'demo' ? 'Reference' : 'Explorer'}</span><b>${S.mode === 'demo' ? short(ref) : `<a href="${EXPLORER + ref}" target="_blank" rel="noopener">tonviewer ↗</a>`}</b></li>
      </ul>
      <div class="stack">${next}</div>
    </div>`, 'full');
}

let toastT = 0;
function toast(msg: string, warn = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (warn ? ' warn' : '');
  clearTimeout(toastT);
  toastT = window.setTimeout(() => { t.className = ''; }, 3200);
}

/* ───────────── navigation ───────────── */
function go(screen: Screen) {
  if (screen === 'buy' && !S.wallet) screen = 'connect';
  if (screen === 'buy' && S.usdt <= 0) screen = 'faucet';
  S.screen = screen;
  closeOverlay();
  render();
  $('#view').scrollTop = 0;
}
function back() {
  if (overlay().className) { closeOverlay(); return; }
  S.screen = null;
  render();
}
async function setMode(m: Mode) {
  if (m === S.mode) return;
  if (m === 'testnet') {
    save();
    S.mode = 'testnet';
    Object.assign(S, { wallet: null, usdt: 0, pending: 0, kvra: 0, paid: 0, acts: [] });
    render();
    const ui = await tonConnect();
    if (ui.wallet && ui.wallet.account.chain === '-3') {
      const raw = Address.parse(ui.wallet.account.address);
      S.wallet = { address: raw.toString({ testOnly: true, bounceable: false }), raw, demo: false };
      render();
      refresh();
    }
  } else {
    S.mode = 'demo';
    Object.assign(S, { wallet: null, usdt: 0, pending: 0, kvra: 0, paid: 0, acts: [] });
    load();
    render();
  }
}
async function connect() {
  if (S.mode === 'demo') {
    const a = Address.parse('0:' + fakeHash());
    S.wallet = { address: a.toString({ testOnly: true, bounceable: false }), demo: true };
    save();
    haptic('success');
    S.screen = S.usdt > 0 ? 'buy' : 'faucet';
    render();
    return;
  }
  const ui = await tonConnect();
  ui.openModal();
}
async function disconnect() {
  if (S.mode === 'testnet' && tc) await tc.disconnect();
  S.wallet = null;
  if (S.mode === 'demo') save();
  render();
}

/* ───────────── icons ───────────── */
const I = {
  presale: '<path d="M4 17l5-5 4 4 7-8"/><path d="M15 8h5v5"/>',
  allocation: '<rect x="3" y="6" width="18" height="13" rx="4"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.3"/>',
  activity: '<path d="M4 7h16M4 12h10M4 17h13"/>',
  stake: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  invite: '<circle cx="9" cy="9" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M18 8v6M15 11h6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v5a3 3 0 003 3h8a3 3 0 003-3v-5"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="4"/><path d="M16 12.5h2"/><path d="M6 6l9-3 1 3"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  down: '<path d="M12 4v16M6 14l6 6 6-6"/>',
};
const icon = (k: keyof typeof I, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;

/* ───────────── views ───────────── */
function countdown() {
  let s = Math.max(0, Math.floor((LAUNCH - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `<span><b>${d}</b>d</span><span><b>${p(h)}</b>h</span><span><b>${p(m)}</b>m</span><span><b>${p(s)}</b>s</span>`;
}

function steps() {
  const st = [
    { done: !!S.wallet, label: 'Connect a wallet', sub: S.wallet ? short(S.wallet.address) : S.mode === 'demo' ? 'Demo wallet, no app needed' : 'TON testnet account', go: 'connect' },
    { done: S.usdt > 0 || S.paid > 0, label: 'Get test USDT', sub: S.usdt > 0 || S.paid > 0 ? `${fmt(S.usdt, 2)} tUSDT` : '1,000 free test USDT', go: 'faucet' },
    { done: S.paid > 0, label: 'Pay in test USDT', sub: S.paid > 0 ? `${fmt(S.paid, 2)} tUSDT paid` : `0.08 tUSDT per KVRA`, go: 'buy' },
    { done: S.kvra > 0 && S.pending === 0, label: 'Claim KVRA', sub: S.pending > 0 ? `${fmt(S.pending)} KVRA ready` : S.kvra > 0 ? `${fmt(S.kvra)} KVRA claimed` : 'After you pay', go: 'claim' },
  ];
  const next = st.findIndex((x) => !x.done || (x.go === 'claim' && S.pending > 0));
  return `<ol class="path">${st.map((x, i) => {
    const cur = i === next;
    return `<li class="${x.done && !cur ? 'done' : ''} ${cur ? 'cur' : ''}">
      <button data-go="${x.go}" ${!cur && !x.done ? 'disabled' : ''}>
        <span class="dot">${x.done && !cur ? icon('check') : i + 1}</span>
        <span class="tx"><b>${x.label}</b><small>${x.sub}</small></span>
        ${cur ? '<span class="go">Start</span>' : ''}
      </button></li>`;
  }).join('')}</ol>`;
}

function viewPresale() {
  const pct = (S.raised / CAP) * 100;
  return `
  <section class="hero card">
    <canvas id="net" aria-hidden="true"></canvas>
    <div class="hero-in">
      <p class="chip-live"><i></i>Presale live · round 2 of 3</p>
      <h1>Machines pay<br><span>machines.</span></h1>
      <div class="cd" data-cd>${countdown()}</div>
      <p class="cd-k">until KVRA launch · 15 Jan 2027</p>
    </div>
  </section>
  <section class="card stats">
    <div class="raise"><span class="k">Raised</span><b data-raised>$${fmt(S.raised)}</b><span class="k right">${fmt(pct, 1)}% of $25M</span></div>
    <div class="bar"><i style="width:${pct.toFixed(2)}%"></i></div>
    <div class="trio">
      <div><span class="k">Price</span><b>0.08</b><small>USDT</small></div>
      <div><span class="k">Participants</span><b data-people>${fmt(S.people)}</b></div>
      <div><span class="k">Your KVRA</span><b class="amber">${fmt(S.kvra + S.pending)}</b></div>
    </div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Your path</h2><span class="k">${S.mode === 'demo' ? 'demo' : 'testnet'}</span></div>
    ${steps()}
  </section>
  <p class="fine">Kelvara is a concept project by Numinae. Not a real token. ${S.mode === 'demo' ? 'Demo mode: nothing leaves this screen.' : 'Testnet mode: test coins only, no real value.'}</p>`;
}

function viewAllocation() {
  const total = S.kvra + S.pending;
  return `
  <section class="card big">
    <span class="k">Total KVRA</span>
    <p class="huge">${fmt(total)}</p>
    <div class="split"><i style="flex:${S.kvra || 0.0001}"></i><i class="p" style="flex:${S.pending || 0.0001}"></i></div>
    <div class="legend2"><span><i></i>Claimed ${fmt(S.kvra)}</span><span><i class="p"></i>Ready to claim ${fmt(S.pending)}</span></div>
    ${S.pending > 0 ? `<button class="btn primary wide" data-go="claim">Claim ${fmt(S.pending)} KVRA</button>` : total === 0 ? `<button class="btn primary wide" data-go="buy">Buy KVRA</button>` : ''}
  </section>
  <section class="card">
    <ul class="kv">
      <li><span>Paid</span><b>${fmt(S.paid, 2)} tUSDT</b></li>
      <li><span>Average price</span><b>${S.paid ? '0.08 tUSDT' : '–'}</b></li>
      <li><span>tUSDT balance</span><b>${fmt(S.usdt, 2)}</b></li>
      <li><span>Wallet</span><b>${S.wallet ? short(S.wallet.address) : 'not connected'}</b></li>
      <li><span>Mode</span><b>${S.mode === 'demo' ? 'Demo' : 'TON testnet'}</b></li>
    </ul>
    ${S.wallet ? `<button class="btn ghost wide" data-act="disconnect">Disconnect wallet</button>` : `<button class="btn ghost wide" data-go="connect">Connect wallet</button>`}
    ${S.mode === 'demo' && S.acts.length ? `<button class="link" data-act="reset">Reset demo</button>` : ''}
  </section>`;
}

function viewActivity() {
  if (!S.acts.length) return `<section class="card empty">${icon('activity', 'xl')}<h2>No activity yet</h2><p>Your faucet taps, payments and claims show up here.</p><button class="btn primary" data-go="${S.wallet ? 'faucet' : 'connect'}">Start</button></section>`;
  const label = { faucet: 'Test USDT from faucet', pay: 'Paid into presale', claim: 'Claimed KVRA' };
  const amt = (a: Act) => a.kind === 'faucet' ? `+${fmt(a.amount)} tUSDT` : a.kind === 'pay' ? `−${fmt(a.amount, 2)} tUSDT` : `+${fmt(a.amount)} KVRA`;
  return `<section class="card list">${S.acts.map((a) => `
    <div class="act ${a.kind}">
      <span class="ai">${icon(a.kind === 'faucet' ? 'drop' : a.kind === 'pay' ? 'presale' : 'bolt')}</span>
      <span class="at"><b>${label[a.kind]}</b><small>${new Date(a.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${a.link ? `<a href="${a.link}" target="_blank" rel="noopener">tonviewer ↗</a>` : 'demo'}</small></span>
      <b class="aa">${amt(a)}</b>
    </div>`).join('')}</section>
    ${S.mode === 'demo' ? '<p class="fine">Demo entries are simulated and have no explorer page.</p>' : ''}`;
}

const RELAYS = [
  { name: 'Relay Aster', up: '99.98%', apr: 11.4, stake: '4.2M' },
  { name: 'Relay Borealis', up: '99.95%', apr: 12.1, stake: '3.1M' },
  { name: 'Relay Cinder', up: '99.91%', apr: 13.6, stake: '1.7M' },
];
function viewStake() {
  const r = RELAYS[S.relay];
  const yearly = (S.stake * r.apr) / 100;
  return `
  <section class="card">
    <div class="card-h"><h2>Stake behind a relay</h2><span class="badge">Preview</span></div>
    <p class="muted">Relays post KVRA as a bond and share the USDT settlement fees with the people who stake behind them.</p>
    <div class="relays" role="radiogroup" aria-label="Relay">${RELAYS.map((x, i) => `
      <button role="radio" aria-checked="${i === S.relay}" class="relay ${i === S.relay ? 'on' : ''}" data-relay="${i}">
        <b>${x.name}</b><small>uptime ${x.up} · ${x.stake} staked</small><span>${x.apr}%</span>
      </button>`).join('')}</div>
  </section>
  <section class="card">
    <label class="k" for="stake">Amount</label>
    <p class="huge sm"><span data-stake>${fmt(S.stake)}</span> <small>KVRA</small></p>
    <input id="stake" type="range" min="100" max="20000" step="100" value="${S.stake}">
    <ul class="kv">
      <li><span>Est. yearly reward</span><b class="amber" data-yearly>${fmt(yearly, 0)} KVRA</b></li>
      <li><span>Unbonding</span><b>14 days</b></li>
      <li><span>Opens</span><b>at mainnet, Q2 2027</b></li>
    </ul>
    <button class="btn primary wide" disabled>Staking opens at mainnet</button>
  </section>
  <p class="fine">Simulated rates for the concept. Nothing can be staked.</p>`;
}

function viewInvite() {
  const link = `${APP_LINK}?startapp=${S.ref}`;
  return `
  <section class="card inv">
    ${icon('invite', 'xl')}
    <h2>Bring a fleet</h2>
    <p class="muted">Share your link. Everyone who joins through it shows up here.</p>
    <div class="linkbox"><code>${link.replace('https://', '')}</code><button class="icon-btn" data-act="copy" aria-label="Copy link">${icon('copy')}</button></div>
    <button class="btn primary wide" data-act="share">${icon('share')} Share in Telegram</button>
  </section>
  <section class="card trio">
    <div><span class="k">Joined</span><b>0</b></div>
    <div><span class="k">Their KVRA</span><b>0</b></div>
    <div><span class="k">Your tier</span><b>Scout</b></div>
  </section>
  <p class="fine">Visual only: the concept has no referral rewards.</p>`;
}

/* sub-screens */
function head(title: string) {
  return `<div class="sub-h">${inTelegram ? '' : `<button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>`}<h2>${title}</h2></div>`;
}
function viewConnect() {
  return `${head('Connect a wallet')}
  <section class="card center">
    ${icon('wallet', 'xl')}
    ${S.mode === 'demo'
      ? `<h2>Use the demo wallet</h2><p class="muted">Walk through the whole flow with a pretend wallet. No app, no keys, nothing is sent.</p>
         <button class="btn primary wide" data-act="connect">Use demo wallet</button>
         <button class="btn ghost wide" data-mode="testnet">Use a real testnet wallet instead</button>`
      : `<h2>Connect a testnet wallet</h2><p class="muted">Tonkeeper or any TON Connect wallet, switched to a <b>testnet</b> account. Mainnet wallets are refused.</p>
         <button class="btn primary wide" data-act="connect">Connect with TON Connect</button>
         <p class="fine">Need test TON for fees? Message @testgiver_ton_bot.</p>`}
  </section>`;
}
function viewFaucet() {
  return `${head('Get test USDT')}
  <section class="card center">
    ${icon('drop', 'xl')}
    <h2>1,000 test USDT</h2>
    <p class="muted">Test USDT (tUSDT) is a Kelvara test token with no value. It stands in for USDT on testnet.</p>
    <ul class="kv"><li><span>Balance</span><b>${fmt(S.usdt, 2)} tUSDT</b></li><li><span>Wallet</span><b>${short(S.wallet!.address)}</b></li></ul>
    <button class="btn primary wide" data-run="faucet" ${S.busy ? 'disabled' : ''}>Get 1,000 tUSDT</button>
    ${S.usdt > 0 ? `<button class="btn ghost wide" data-go="buy">Continue to payment</button>` : ''}
  </section>`;
}
function viewBuy() {
  const kv = S.amount / PRICE;
  const over = S.amount > S.usdt;
  return `${head('Buy KVRA')}
  <section class="card">
    <label class="k" for="amt">You pay</label>
    <div class="amt"><input id="amt" inputmode="decimal" value="${S.amount}" aria-describedby="bal"><span>tUSDT</span></div>
    <p class="k" id="bal">Balance ${fmt(S.usdt, 2)} tUSDT</p>
    <div class="chips">${[50, 250, 1000].map((v) => `<button class="${S.amount === v ? 'on' : ''}" data-amt="${v}">${fmt(v)}</button>`).join('')}<button data-amt="max">Max</button></div>
    <div class="swap" aria-hidden="true">${icon('down')}</div>
    <span class="k">You get</span>
    <p class="huge amber"><span data-kv>${fmt(kv)}</span> <small>KVRA</small></p>
    <ul class="kv">
      <li><span>Price</span><b>0.08 tUSDT</b></li>
      <li><span>Network fee</span><b>~0.11 TON ${S.mode === 'demo' ? '<em>simulated</em>' : '<em>test</em>'}</b></li>
      <li><span>Claim</span><b>right after paying</b></li>
    </ul>
    <button class="btn primary wide" data-run="pay" ${over || S.amount <= 0 || S.busy ? 'disabled' : ''} data-paybtn>${over ? 'Not enough tUSDT' : `Pay ${fmt(S.amount, 2)} tUSDT`}</button>
  </section>`;
}
function viewClaim() {
  return `${head('Claim KVRA')}
  <section class="card center">
    <div class="claim-orb"><span></span><span></span><span></span><b>${fmt(S.pending)}</b><small>KVRA</small></div>
    <p class="muted">${S.pending > 0 ? 'Your allocation is recorded on the sale contract. Claiming mints it to your wallet.' : 'Nothing to claim yet. Pay first, then come back.'}</p>
    ${S.pending > 0 ? `<button class="btn primary wide" data-run="claim" ${S.busy ? 'disabled' : ''}>Claim ${fmt(S.pending)} KVRA</button>` : `<button class="btn primary wide" data-go="buy">Buy KVRA</button>`}
  </section>`;
}

/* ───────────── render ───────────── */
const TABS: [Tab, string][] = [['presale', 'Presale'], ['allocation', 'Allocation'], ['activity', 'Activity'], ['stake', 'Stake'], ['invite', 'Invite']];
function render() {
  const body = S.screen === 'connect' ? viewConnect()
    : S.screen === 'faucet' ? (S.wallet ? viewFaucet() : viewConnect())
    : S.screen === 'buy' ? viewBuy()
    : S.screen === 'claim' ? viewClaim()
    : ({ presale: viewPresale, allocation: viewAllocation, activity: viewActivity, stake: viewStake, invite: viewInvite } as const)[S.tab]();
  $('#view').innerHTML = `<div class="v ${S.screen ? 'sub' : ''}" data-key="${S.screen || S.tab}">${body}</div>`;
  $('#top').innerHTML = `
    <div class="brand">${mark}<span>KELVARA</span></div>
    <div class="seg" role="radiogroup" aria-label="Mode">
      <button role="radio" aria-checked="${S.mode === 'demo'}" data-mode="demo" class="${S.mode === 'demo' ? 'on' : ''}">Demo</button>
      <button role="radio" aria-checked="${S.mode === 'testnet'}" data-mode="testnet" class="${S.mode === 'testnet' ? 'on' : ''}">Testnet</button>
    </div>`;
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="${!S.screen && S.tab === k ? 'on' : ''}" data-tab="${k}" aria-label="${l}">${icon(k as keyof typeof I)}<span>${l}</span></button>`).join('');
  document.body.classList.toggle('has-sub', !!S.screen);
  if (inTelegram) { try { S.screen || overlay().className ? tg.BackButton.show() : tg.BackButton.hide(); } catch { /* */ } }
  const c = $('#net') as HTMLCanvasElement | null;
  if (c) netAnim(c);
}
const mark = `<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="1" y="1" width="26" height="26" rx="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="19" r="3" fill="currentColor"/><circle cx="19" cy="9" r="3" fill="currentColor"/><path d="M11 17l6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/* small 2D network behind the presale hero */
let netRAF = 0;
function netAnim(c: HTMLCanvasElement) {
  cancelAnimationFrame(netRAF);
  const ctx = c.getContext('2d')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = c.clientWidth, H = c.clientHeight;
  c.width = W * dpr; c.height = H * dpr;
  ctx.scale(dpr, dpr);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = Array.from({ length: 34 }, () => ({ x: W * (0.5 + rnd() * 0.55), y: H * (rnd() * 1.0), z: 0.4 + rnd() * 0.6 }));
  const edges: [number, number][] = [];
  pts.forEach((p, i) => {
    pts.map((q, j) => [Math.hypot(p.x - q.x, p.y - q.y), j]).sort((a, b) => a[0] - b[0]).slice(1, 3).forEach(([, j]) => edges.push([i, j as number]));
  });
  const pulses = Array.from({ length: 14 }, (_, i) => ({ e: i % edges.length, t: rnd() }));
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw = (now: number) => {
    if (!c.isConnected) return;
    const t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    const off = (p: { x: number; y: number; z: number }) => ({ x: p.x + Math.sin(t * 0.3 + p.y * 0.01) * 6 * p.z, y: p.y + Math.cos(t * 0.25 + p.x * 0.01) * 5 * p.z });
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(242,239,232,.14)';
    ctx.beginPath();
    edges.forEach(([a, b]) => { const p = off(pts[a]), q = off(pts[b]); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); });
    ctx.stroke();
    pts.forEach((p, i) => {
      const o = off(p);
      ctx.fillStyle = i % 9 === 0 ? '#ffb224' : `rgba(242,239,232,${0.35 + p.z * 0.4})`;
      ctx.beginPath(); ctx.arc(o.x, o.y, i % 9 === 0 ? 3 : 1.6, 0, 7); ctx.fill();
    });
    pulses.forEach((u) => {
      if (!still) u.t += 0.012;
      if (u.t > 1) { u.t = 0; u.e = Math.floor(rnd() * edges.length); }
      const [a, b] = edges[u.e]; const p = off(pts[a]), q = off(pts[b]);
      const x = p.x + (q.x - p.x) * u.t, y = p.y + (q.y - p.y) * u.t;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, 'rgba(255,178,36,1)'); g.addColorStop(1, 'rgba(255,178,36,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
    });
    if (!still) netRAF = requestAnimationFrame(draw);
  };
  netRAF = requestAnimationFrame(draw);
}

/* ───────────── events ───────────── */
document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const el = t.closest('[data-tab],[data-go],[data-tabgo],[data-run],[data-mode],[data-act],[data-amt],[data-relay]') as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  const d = el.dataset;
  if (d.tab) { haptic(); S.tab = d.tab as Tab; S.screen = null; render(); $('#view').scrollTop = 0; }
  else if (d.go) { haptic(); d.go === 'home' ? (closeOverlay(), (S.screen = null), (S.tab = 'presale'), render()) : go(d.go as Screen); }
  else if (d.tabgo) { closeOverlay(); S.screen = null; S.tab = d.tabgo as Tab; render(); }
  else if (d.run) run(d.run as Kind);
  else if (d.mode) { haptic(); setMode(d.mode as Mode); }
  else if (d.amt) {
    S.amount = d.amt === 'max' ? Math.floor(S.usdt * 100) / 100 : Number(d.amt);
    render();
  } else if (d.relay) { S.relay = Number(d.relay); render(); }
  else if (d.act === 'connect') connect();
  else if (d.act === 'disconnect') disconnect();
  else if (d.act === 'reset') resetDemo();
  else if (d.act === 'back') back();
  else if (d.act === 'copy') {
    const link = `${APP_LINK}?startapp=${S.ref}`;
    try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast(link); }
  } else if (d.act === 'share') {
    const link = `${APP_LINK}?startapp=${S.ref}`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Kelvara: machines pay machines. A concept launch by Numinae.')}`;
    if (inTelegram) tg.openTelegramLink(url); else window.open(url, '_blank', 'noopener');
  }
});
document.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'amt') {
    const v = parseFloat(t.value.replace(',', '.'));
    S.amount = isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
    const kv = $('[data-kv]'); if (kv) kv.textContent = fmt(S.amount / PRICE);
    const b = $('[data-paybtn]') as HTMLButtonElement;
    const over = S.amount > S.usdt;
    b.disabled = over || S.amount <= 0;
    b.textContent = over ? 'Not enough tUSDT' : `Pay ${fmt(S.amount, 2)} tUSDT`;
    document.querySelectorAll('[data-amt]').forEach((c) => c.classList.toggle('on', Number((c as HTMLElement).dataset.amt) === S.amount));
  }
  if (t.id === 'stake') {
    S.stake = Number(t.value);
    $('[data-stake]').textContent = fmt(S.stake);
    $('[data-yearly]').textContent = fmt((S.stake * RELAYS[S.relay].apr) / 100) + ' KVRA';
  }
});

/* live-looking figures */
setInterval(() => {
  const cd = $('[data-cd]'); if (cd) cd.innerHTML = countdown();
}, 1000);
setInterval(() => {
  if (Math.random() < 0.6) {
    S.raised += [50, 100, 250, 500, 1000][Math.floor(Math.random() * 5)];
    if (Math.random() < 0.4) S.people += 1;
    const r = $('[data-raised]'); if (r) r.textContent = '$' + fmt(S.raised);
    const p = $('[data-people]'); if (p) p.textContent = fmt(S.people);
  }
}, 1500);

/* boot */
load();
render();
if (!inTelegram && location.hash === '#testnet') setMode('testnet');
