/* =============================================
   DEXO SNAKE — MARKET PAGE
   market.js
============================================= */

// =================== FIREBASE ===================
const firebaseConfig = {
    apiKey: "AIzaSyCtxk7gcilx1Be8k44SQ32eio6EBmh8IVc",
    authDomain: "loyiha1-773ba.firebaseapp.com",
    databaseURL: "https://loyiha1-773ba-default-rtdb.firebaseio.com",
    projectId: "loyiha1-773ba",
    storageBucket: "loyiha1-773ba.firebasestorage.app",
    messagingSenderId: "612930407157",
    appId: "1:612930407157:web:32036c06746c1edd8f93bc"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// =================== TELEGRAM ===================
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

let userId = 'test_' + Math.floor(Math.random() * 99999);
let userName = 'Player';
if (tg?.initDataUnsafe?.user) {
    userId   = String(tg.initDataUnsafe.user.id);
    userName = tg.initDataUnsafe.user.first_name || 'Player';
}

// =================== GLOBAL ===================
let myBalance  = 0;
let myItems    = {};   // { itemId: { expiresAt: timestamp } }
let pendingBuy = null; // { id, name, price, days, emoji }

// =================== ITEM CONFIG ===================
// Skin emoji mapping (ID → emoji)
const ITEM_EMOJIS = {
    neon:'⚡', galaxy:'🌌', fire:'🔥', ice:'❄️', gold:'👑', matrix:'💚',
    eye_angry:'😡', eye_star:'🌟', eye_heart:'❤️',
    name_gold:'👑', name_red:'🔴', name_grad:'🌈',
    badge_crown:'👑', badge_fire:'🔥', badge_skull:'💀',
    badge_star:'⭐', badge_lightning:'⚡', badge_diamond:'💎',
    border_cyan:'💠', border_gold:'🌟', border_rainbow:'🌈',
    arena_space:'🌌', arena_ocean:'🌊', arena_lava:'🌋', arena_matrix:'💚',
    food_apple:'🍎', food_diamond:'💎', food_star:'⭐', food_coin:'🪙',
    vip_7:'🥈', vip_30:'🥇',
};

// VIP paket ichidagi itemlar
const VIP_ITEMS = {
    vip_7: [
        { id:'gold',         days:7,  price:0 },
        { id:'badge_crown',  days:7,  price:0 },
        { id:'name_gold',    days:14, price:0 },
        { id:'border_gold',  days:14, price:0 },
        { id:'arena_space',  days:7,  price:0 },
    ],
    vip_30: [
        { id:'neon',          days:30, price:0 },
        { id:'galaxy',        days:30, price:0 },
        { id:'fire',          days:30, price:0 },
        { id:'ice',           days:30, price:0 },
        { id:'gold',          days:30, price:0 },
        { id:'matrix',        days:30, price:0 },
        { id:'badge_diamond', days:30, price:0 },
        { id:'name_grad',     days:30, price:0 },
        { id:'border_rainbow',days:30, price:0 },
        { id:'arena_space',   days:30, price:0 },
        { id:'arena_ocean',   days:30, price:0 },
        { id:'arena_lava',    days:30, price:0 },
        { id:'arena_matrix',  days:30, price:0 },
        { id:'food_apple',    days:30, price:0 },
        { id:'food_diamond',  days:30, price:0 },
        { id:'food_star',     days:30, price:0 },
        { id:'food_coin',     days:30, price:0 },
    ],
};

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupModal();
    setupBuyButtons();
    loadUserData();
    startExpiryChecker();
});

// =================== FIREBASE ===================
function loadUserData() {
    const ref = db.ref('users/' + userId);
    ref.once('value').then(snap => {
        if (!snap.exists()) {
            ref.set({ username:userName, telegramId:userId, balance:0, createdAt:Date.now() });
            return;
        }
        const d = snap.val();
        myBalance = parseFloat(d.balance || 0);
        myItems   = d.market_items || {};
        setEl('mk-balance', myBalance.toFixed(5));
        renderAllButtons();
        renderActiveItems();
    }).catch(() => {});

    ref.child('balance').on('value', snap => {
        myBalance = parseFloat(snap.val() || 0);
        setEl('mk-balance', myBalance.toFixed(5));
    });
}

// =================== TABS ===================
function setupTabs() {
    document.querySelectorAll('.mk-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.mk-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.mk-tab-content').forEach(c => c.classList.add('hidden'));
            tab.classList.add('active');
            const content = document.getElementById('tab-' + tab.dataset.tab);
            if (content) content.classList.remove('hidden');
        });
    });
}

// =================== BUY BUTTONS ===================
function setupBuyButtons() {
    document.querySelectorAll('.mk-buy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            if (!id) return;

            // Aktiv itemni qayta sotib olmaydi
            if (isActive(id)) return;

            // Card dan ma'lumot olish
            const card = btn.closest('[data-id]');
            if (!card) return;

            const name  = card.dataset.name  || id;
            const price = parseFloat(card.dataset.price || btn.closest('[data-price]')?.dataset.price || 0);
            const days  = parseInt(card.dataset.days   || btn.closest('[data-days]')?.dataset.days  || 7);

            openModal({ id, name, price, days, emoji: ITEM_EMOJIS[id] || '🛒' });
        });
    });
}

// =================== MODAL ===================
function openModal(item) {
    pendingBuy = item;
    const expireDate = new Date(Date.now() + item.days * 86400000);
    const dateStr    = expireDate.toLocaleDateString('uz-UZ', {
        day:'2-digit', month:'short', year:'numeric'
    });

    setEl('modal-emoji',   item.emoji || '🛒');
    setEl('modal-title',   item.name);
    setEl('modal-desc',    item.days + ' kunlik item. Sotib olishni tasdiqlang.');
    setEl('modal-price',   item.price + ' TON');
    setEl('modal-days',    item.days + ' kun');
    setEl('modal-expire',  dateStr + ' gacha');

    document.getElementById('modal-confirm').disabled = false;
    setEl('modal-confirm-txt', 'SOTIB OLISH');
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    pendingBuy = null;
}

function setupModal() {
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-overlay')) closeModal();
    });
    document.getElementById('modal-confirm').addEventListener('click', confirmBuy);
}

async function confirmBuy() {
    if (!pendingBuy) return;
    const { id, name, price, days } = pendingBuy;

    if (myBalance < price) {
        closeModal();
        showToast('❌ Balans yetarli emas!', 'error');
        return;
    }

    const btn = document.getElementById('modal-confirm');
    btn.disabled = true;
    setEl('modal-confirm-txt', 'YUKLANMOQDA...');

    try {
        const now       = Date.now();
        const expiresAt = now + days * 86400000;
        const userRef   = db.ref('users/' + userId);

        // Balansdan ayirish
        await userRef.child('balance').transaction(bal => {
            const b = parseFloat(bal) || 0;
            if (b < price) return;
            return parseFloat((b - price).toFixed(5));
        });

        // VIP paket bo'lsa — barcha itemlarni berish
        if (VIP_ITEMS[id]) {
            const updates = {};
            VIP_ITEMS[id].forEach(vi => {
                const viExpire = now + vi.days * 86400000;
                updates[`market_items/${vi.id}`] = { expiresAt: viExpire, days: vi.days };
            });
            // VIP itemning o'zini ham yozish
            updates[`market_items/${id}`] = { expiresAt, days };
            await userRef.update(updates);

            VIP_ITEMS[id].forEach(vi => {
                myItems[vi.id] = { expiresAt: now + vi.days * 86400000, days: vi.days };
            });
        } else {
            await userRef.child(`market_items/${id}`).set({ expiresAt, days });
        }

        myItems[id] = { expiresAt, days };

        renderAllButtons();
        renderActiveItems();
        closeModal();
        showToast('✅ ' + name + ' sotib olindi! ' + days + ' kun', 'success');

    } catch (e) {
        btn.disabled = false;
        setEl('modal-confirm-txt', 'SOTIB OLISH');
        showToast('Xatolik yuz berdi. Qayta urinib ko\'ring.', 'error');
    }
}

// =================== BUTTON RENDER ===================
function renderAllButtons() {
    document.querySelectorAll('.mk-buy-btn').forEach(btn => {
        const id   = btn.dataset.id;
        if (!id) return;
        const txtel = document.getElementById('btxt-' + id);
        const card  = btn.closest('[data-id]');
        const price = card ? (parseFloat(card.dataset.price) || 0) : 0;
        const days  = card ? (parseInt(card.dataset.days)    || 7) : 7;

        if (isActive(id)) {
            btn.classList.add('owned');
            btn.classList.remove('expired');
            const remaining = getRemainingDays(id);
            if (txtel) txtel.textContent = '✅ ' + remaining + ' kun qoldi';

            // Skin card uchun progress bar
            const sbEl = document.getElementById('sb-' + id);
            if (sbEl) {
                const item    = myItems[id];
                const total   = item.days * 86400000;
                const left    = item.expiresAt - Date.now();
                const pct     = Math.max(0, Math.min(100, (left / total) * 100));
                sbEl.innerHTML = `<div class="skin-status-fill" style="width:${pct}%"></div>`;
            }
        } else {
            btn.classList.remove('owned','expired');
            if (txtel) {
                // Original narx va kunni qayta ko'rsatish
                if (id.startsWith('vip_')) {
                    txtel.textContent = price + ' TON · SOTIB OL';
                } else if (['eye_angry','eye_star','eye_heart',
                            'border_cyan','border_gold','border_rainbow'].includes(id)) {
                    txtel.textContent = 'SOTIB OL';
                } else {
                    txtel.textContent = price > 0 ? price + ' TON' : 'SOTIB OL';
                }
            }
            const sbEl = document.getElementById('sb-' + id);
            if (sbEl) sbEl.innerHTML = '';
        }
    });
}

// =================== AKTIV ITEMLAR ===================
function renderActiveItems() {
    const listEl = document.getElementById('active-items-list');
    if (!listEl) return;

    const activeIds = Object.keys(myItems).filter(id => isActive(id));

    if (!activeIds.length) {
        listEl.innerHTML = '<div class="no-items">Hozircha aktiv item yo\'q</div>';
        return;
    }

    listEl.innerHTML = '';
    activeIds.forEach(id => {
        const item      = myItems[id];
        const remaining = getRemainingDays(id);
        const total     = item.days || 7;
        const pct       = Math.max(0, Math.min(100, (remaining / total) * 100));
        const emoji     = ITEM_EMOJIS[id] || '🛒';

        const div = document.createElement('div');
        div.className = 'active-item-row';
        div.innerHTML = `
            <span class="ai-emoji">${emoji}</span>
            <div class="ai-info">
                <span class="ai-name">${id}</span>
                <span class="ai-expire">${remaining} kun qoldi</span>
            </div>
            <div class="ai-bar">
                <div class="ai-bar-fill" style="width:${pct}%"></div>
            </div>`;
        listEl.appendChild(div);
    });
}

// =================== EXPIRY CHECKER ===================
function startExpiryChecker() {
    // Har 60 soniyada muddati o'tgan itemlarni tekshirish
    setInterval(() => {
        let changed = false;
        Object.keys(myItems).forEach(id => {
            if (myItems[id] && Date.now() > myItems[id].expiresAt) {
                // Firebase dan o'chirish
                db.ref(`users/${userId}/market_items/${id}`).remove();
                delete myItems[id];
                changed = true;
            }
        });
        if (changed) {
            renderAllButtons();
            renderActiveItems();
        }
    }, 60000);
}

// =================== HELPERS ===================
function isActive(id) {
    return myItems[id] && Date.now() < myItems[id].expiresAt;
}

function getRemainingDays(id) {
    if (!myItems[id]) return 0;
    const ms = myItems[id].expiresAt - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

let toastTimer = null;
function showToast(msg, type) {
    const el = document.getElementById('mk-toast');
    el.textContent = msg;
    el.className   = 'mk-toast ' + (type || '');
    el.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}
