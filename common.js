/* Shared helpers: index.html (billing) aur admin.html dono use karte hain */
/* ---------- Loading spinner: har network request par (0.1s se lamba ho to) ghoomta hua circle ---------- */
let _busy = 0, _quiet = 0, _spinT = null;
function _spinShow() {
  if (document.getElementById('spin')) return;
  const d = document.createElement('div'); d.id = 'spin'; d.innerHTML = '<i></i>';
  document.body.appendChild(d);
}
function _spinHide() { const d = document.getElementById('spin'); if (d) d.remove(); }
const trackedFetch = (...a) => {
  if (_quiet) return fetch(...a);
  if (++_busy === 1) _spinT = setTimeout(_spinShow, 100);
  return fetch(...a).finally(() => { if (--_busy === 0) { clearTimeout(_spinT); _spinHide(); } });
};
/* background kaam (auto-save, auto-refresh) jis par spinner nahi dikhana */
async function quietly(fn) { _quiet++; try { return await fn(); } finally { _quiet--; } }

const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { global: { fetch: trackedFetch } });
if (CFG.LOGO) { const _i = new Image(); _i.src = CFG.LOGO; }   // logo pehle se load rakho (print ke liye)
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });
const money = n => CFG.CURRENCY + ' ' + fmt(n);
const jsq = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

/* Bill ID: NM-000123 */
const billId = n => n ? `${CFG.BILL_PREFIX}-${String(n).padStart(6, '0')}` : 'NEW';

/* Order type: takeaway | delivery | dine_in */
const typeText = o => o.order_type === 'delivery' ? 'Delivery'
  : o.order_type === 'dine_in' ? 'Dine-in' + (o.table_name ? ' - ' + o.table_name : '') : 'Take Away';

/* Category colors (id ke hisab se fixed rehte hain) */
const PALETTE = [
  { bg: '#fde8e4', bd: '#c8372a', fg: '#7a1a10' },
  { bg: '#fff1cf', bd: '#d99a00', fg: '#6b4a00' },
  { bg: '#e3f2e8', bd: '#1f7a4d', fg: '#0f4a2d' },
  { bg: '#e4eefc', bd: '#2b6cb0', fg: '#173f6e' },
  { bg: '#f1e6fa', bd: '#8a4fbf', fg: '#4b2570' },
  { bg: '#fde6f1', bd: '#c2378a', fg: '#6e1a4c' },
  { bg: '#e0f4f5', bd: '#1a8a91', fg: '#0d4d51' }
];
const catStyle = id => { const c = PALETTE[Math.abs(Number(id) || 0) % PALETTE.length]; return `--bg:${c.bg};--bd:${c.bd};--fg:${c.fg}`; };

/* Login: "ali" ya "ali@mail.com" dono chalte hain */
const toEmail = u => { u = String(u).trim().toLowerCase(); return u.includes('@') ? u : `${u}@${CFG.LOGIN_DOMAIN}`; };
const signIn = (u, p) => sb.auth.signInWithPassword({ email: toEmail(u), password: p });
async function getProfile(uid) {
  const { data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  return data;
}
async function myProfile() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { session: null, profile: null };
  return { session, profile: await getProfile(session.user.id) };
}

/* ---------- Receipt (thermal 80mm / 58mm) ---------- */
function receiptHTML(o) {
  const d = new Date(o.created_at);
  const date = d.toLocaleDateString('en-GB');
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const type = o.order_type === 'delivery' ? 'DELIVERY'
    : o.order_type === 'dine_in' ? 'DINE-IN' + (o.table_name ? ' - ' + String(o.table_name).toUpperCase() : '')
    : 'TAKE AWAY';
  return `
    ${CFG.LOGO ? `<img class="logo" src="${esc(CFG.LOGO)}" alt="${esc(CFG.SHOP_NAME)}">` : `<div class="c b big">${esc(CFG.SHOP_NAME)}</div>`}
    <div class="c">${esc(CFG.SHOP_ADDRESS)}</div>
    ${CFG.TAGLINE ? `<div class="c">${esc(CFG.TAGLINE)}</div>` : ''}
    <div class="c">${esc(CFG.SHOP_PHONE)}</div>
    <div class="hr"></div>
    <div class="r"><span>Cashier: ${esc(o.cashier_name || '-')}</span><span class="b">${date}</span></div>
    <div class="c b mid">${esc(type)}</div>
    <div class="r"><span>Bill ID: <b>${billId(o.order_no)}</b></span><span class="b">${time}</span></div>
    <div>Customer: ${esc(o.customer_name || CFG.DEFAULT_CUSTOMER)}</div>
    ${o.note ? `<div>Note: ${esc(o.note)}</div>` : ''}
    <div class="hr"></div>
    <div class="th"><div>Descriptions</div><div class="n">Qty</div><div class="n">Rate</div><div class="n">Amnt</div></div>
    ${o.lines.map(l => `<div class="tr"><div class="b">${esc(l.name)}</div><div class="n">${l.qty}</div><div class="n">${fmt(l.price)}</div><div class="n">${fmt(l.qty * l.price)}</div></div>`).join('')}
    <div class="hr solid"></div>
    <div class="r"><span>Total Rs :</span><span>${fmt(o.subtotal)}</span></div>
    <div class="r"><span>Total Disc Rs :</span><span>${fmt(o.discount)}</span></div>
    <div class="r b big"><span>Sub Total Rs :</span><span>${fmt(o.total)}</span></div>
    <div class="r"><span>Payment :</span><span>${esc(o.payment)}</span></div>
    <div class="hr"></div>
    ${CFG.QR_CODE ? `<div class="paymentQr"><img src="${esc(CFG.QR_CODE)}" alt="Online payment QR code"></div>` : ''}
    <div class="c">${esc(CFG.FOOTER)}</div>`;
}
function printReceipt(o) {
  let box = document.getElementById('receipt');
  if (!box) { box = document.createElement('div'); box.id = 'receipt'; document.body.appendChild(box); }
  const p58 = CFG.PAPER === '58mm';
  box.className = p58 ? 'p58' : '';
  let st = document.getElementById('pageSize');
  if (!st) { st = document.createElement('style'); st.id = 'pageSize'; document.head.appendChild(st); }
  st.textContent = `@media print{@page{size:${p58 ? '58mm' : '80mm'} auto;margin:0}#receipt{width:${p58 ? '52mm' : '68mm'};margin-left:0!important;margin-right:auto!important}}`;
  box.innerHTML = `<div class="rc">${receiptHTML(o)}</div>`;
  const go = () => setTimeout(() => window.print(), 100);
  const imgs = [...box.querySelectorAll('img')];
  Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
    img.onload = img.onerror = resolve;
  }))).then(go);
}
function closeModal() { const m = document.getElementById('modal'); if (m) m.remove(); }
function viewReceipt(o) {
  closeModal();
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal';
  m.innerHTML = `<div class="paper ${CFG.PAPER === '58mm' ? 'p58' : ''}"><div class="rc">${receiptHTML(o)}</div>
    <div class="inline" style="margin-top:12px;justify-content:center"><button id="mPrint">Print</button><button class="ghost" id="mClose">Close</button></div></div>`;
  m.onclick = e => { if (e.target === m) closeModal(); };
  document.body.appendChild(m);
  m.querySelector('#mPrint').onclick = () => printReceipt(o);
  m.querySelector('#mClose').onclick = closeModal;
}
