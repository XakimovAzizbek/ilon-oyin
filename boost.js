/* =============================================
   DEXO SNAKE — BOOST PAGE
   boost.js
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

let userId   = 'test_' + Math.floor(Math.random() * 99999);
let userName = 'Player';
if (tg?.initDataUnsafe?.user) {
    userId   = String(tg.initDataUnsafe.user.id);
    userName = tg.initDataUnsafe.user.first_name || 'Player';
}

// =================== GLOBAL ===================
let myBalance   = 0;
let myBoosts    = {};   // { speed:2, shield:1, ... }
let myPerms     = {};   // { startlen:true, multiplier:false, ... }
let myStreak    = 0;
let lastClaimed = 0;    // timestamp (kun boshi)

// Modal pending
let pendingItem   = null; // { type:'boost'|'perm'|'daily', id, price, emoji, name, desc }

// =================== BOOST CONFIG ===================
const BOOSTS = {
    speed:   { emoji:'⚡', name:'Tezlik',   desc:'2x tezlik · 30 sek',          price:0.005 },
    shield:  { emoji:'🛡️', name:'Qalqon',   desc:'1x o\'limdan saqlanish',       price:0.01  },
    magnet:  { emoji:'🧲', name:'Magnit',   desc:'Ovqatlarni tortib olish',       price:0.008 },
    blast:   { emoji:'💥', name:'Portlash', desc:'Raqiblarni kichraytirish',      price:0.015 },
};
const PERMS = {
    startlen:   { emoji:'🐍', name:'Uzun Boshlanish',  price:0.05  },
    multiplier: { emoji:'💰', name:'TON Multiplier',   price:0.10  },
    minimap:    { emoji:'👁️', name:'Katta Minimap',    price:0.03  },
};

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', () => {
    loadUserData();
    setupBuyButtons();
    setupModal();
    setupDailyBtn();
});

// =================== FIREBASE DAN YUKLASH ===================
function loadUserData() {
    const ref = db.ref('users/' + userId);

    ref.once('value').then(snap => {
        if (!snap.exists()) {
            ref.set({ username: userName, telegramId: userId, balance: 0,
                      createdAt: Date.now(),
                      stats: { games:0, kills:0, maxLen:0, earned:0 } });
            return;
        }
        const d = snap.val();
        myBalance   = parseFloat(d.balance   || 0);
        myBoosts    = d.boosts    || {};
        myPerms     = d.perms     || {};
        myStreak    = parseInt(d.streak?.count || 0);
        lastClaimed = parseInt(d.streak?.lastClaimed || 0);

        renderAll();
    }).catch(() => {});

    // Realtime balans
    ref.child('balance').on('value', snap => {
        myBalance = parseFloat(snap.val() || 0);
        setEl('bs-balance', myBalance.toFixed(5));
    });
}

// =================== HAMMA NARSANI RENDER QILISH ===================
function renderAll() {
    setEl('bs-balance', myBalance.toFixed(5));
    renderBoostStocks();
    renderPermButtons();
    renderStreak();
    renderDailyBtn();
}

// Boost stoklarini ko'rsatish
function renderBoostStocks() {
    Object.keys(BOOSTS).forEach(id => {
        const cnt = parseInt(myBoosts[id] || 0);
        setEl('cnt-' + id, cnt);
    });
}

// Doimiy bonuslar tugmalarini yangilash
function renderPermButtons() {
    Object.keys(PERMS).forEach(id => {
        const btn = document.querySelector(`.perm-btn[data-id="${id}"]`);
        const txtel = document.getElementById('perm-txt-' + id);
        if (!btn) return;
        if (myPerms[id]) {
            btn.classList.add('bought');
            if (txtel) txtel.textContent = '✅ Sotib olingan';
        } else {
            btn.classList.remove('bought');
            if (txtel) txtel.textContent = PERMS[id].price + ' TON';
        }
    });
}

// Streak render
function renderStreak() {
    const DAYS = ['Dsh','Sesh','Chor','Pay','Jum','Shan','Yak'];
    const dotsEl = document.getElementById('streak-dots');
    if (!dotsEl) return;

    dotsEl.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const div = document.createElement('div');
        div.className = 'streak-dot';
        const isDone  = i < myStreak;
        const isToday = i === myStreak && myStreak < 7;
        if (isDone)  div.classList.add('done');
        if (isToday) div.classList.add('today');
        div.innerHTML = `
            <span class="streak-dot-ico">${isDone ? '✅' : isToday ? '🔥' : '⭕'}</span>
            <span class="streak-dot-lbl">${DAYS[i]}</span>`;
        dotsEl.appendChild(div);
    }

    setEl('streak-count', myStreak + ' kun');

    const pct = (myStreak / 7) * 100;
    const fill = document.getElementById('streak-fill');
    if (fill) fill.style.width = pct + '%';

    setEl('streak-txt', myStreak + '/7 kun');
}

// Kunlik tugma
function renderDailyBtn() {
    const btn   = document.getElementById('btn-daily');
    const txtel = document.getElementById('daily-btn-txt');
    if (!btn) return;

    const todayStart = getTodayStart();
    const claimed    = lastClaimed >= todayStart;

    if (claimed) {
        btn.disabled = true;
        if (txtel) txtel.textContent = 'OLINDI ✅';
    } else {
        btn.disabled = false;
        if (txtel) txtel.textContent = 'OLISH';
    }
}

// =================== KUNLIK TUGMA ===================
function setupDailyBtn() {
    document.getElementById('btn-daily').addEventListener('click', claimDaily);
}

async function claimDaily() {
    const todayStart = getTodayStart();
    if (lastClaimed >= todayStart) {
        showToast('Bugun allaqachon oldingiz!', 'error');
        return;
    }

    const btn = document.getElementById('btn-daily');
    btn.disabled = true;

    try {
        const userRef = db.ref('users/' + userId);

        // Streak hisoblash
        const yesterday = todayStart - 86400000;
        let newStreak = lastClaimed >= yesterday ? myStreak + 1 : 1;
        if (newStreak > 7) newStreak = 1; // Reset after 7

        // Streak 7 ga yetsa bonus
        const bonusTon   = newStreak === 7 ? 0.01 : 0.001;
        const bonusLabel = newStreak === 7 ? '🎉 Streak Bonus! +0.01 TON!' : '🎁 +0.001 TON olindi!';

        // Balans yangilash
        await userRef.child('balance').transaction(bal => (parseFloat(bal) || 0) + bonusTon);

        // Streak saqlash
        await userRef.child('streak').set({
            count:       newStreak === 7 ? 0 : newStreak, // 7 dan keyin reset
            lastClaimed: Date.now(),
        });

        myStreak    = newStreak === 7 ? 0 : newStreak;
        lastClaimed = Date.now();

        renderStreak();
        renderDailyBtn();
        showToast(bonusLabel, 'success');

    } catch (e) {
        btn.disabled = false;
        showToast('Xatolik yuz berdi', 'error');
    }
}

// =================== SOTIB OLISH TUGMALARI ===================
function setupBuyButtons() {
    // Boost tugmalari
    document.querySelectorAll('.boost-buy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id    = btn.dataset.id;
            const price = parseFloat(btn.dataset.price);
            const cfg   = BOOSTS[id];
            openModal({
                type:  'boost',
                id,
                price,
                emoji: cfg.emoji,
                name:  cfg.name,
                desc:  cfg.desc,
            });
        });
    });

    // Doimiy bonus tugmalari
    document.querySelectorAll('.perm-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id    = btn.dataset.id;
            if (myPerms[id]) return; // Allaqachon sotib olingan
            const price = parseFloat(btn.dataset.price);
            const cfg   = PERMS[id];
            openModal({
                type:  'perm',
                id,
                price,
                emoji: cfg.emoji,
                name:  cfg.name,
                desc:  'Abadiy faol bo\'ladi',
            });
        });
    });
}

// =================== MODAL ===================
function openModal(item) {
    pendingItem = item;
    setEl('modal-emoji', item.emoji);
    setEl('modal-title', item.name);
    setEl('modal-desc',  item.desc);
    setEl('modal-price', item.price + ' TON');
    document.getElementById('modal-confirm').disabled = false;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    pendingItem = null;
}

function setupModal() {
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-overlay')) closeModal();
    });
    document.getElementById('modal-confirm').addEventListener('click', confirmPurchase);
}

async function confirmPurchase() {
    if (!pendingItem) return;

    const { type, id, price } = pendingItem;

    // Balans tekshirish
    if (myBalance < price) {
        closeModal();
        showToast('❌ Balans yetarli emas!', 'error');
        return;
    }

    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.disabled = true;

    try {
        const userRef = db.ref('users/' + userId);

        // Balansdan ayirish
        await userRef.child('balance').transaction(bal => {
            const b = parseFloat(bal) || 0;
            if (b < price) return; // abort transaction
            return parseFloat((b - price).toFixed(5));
        });

        if (type === 'boost') {
            // Stokni oshirish
            const curStock = parseInt(myBoosts[id] || 0);
            const newStock = curStock + 1;
            await userRef.child('boosts/' + id).set(newStock);
            myBoosts[id] = newStock;
            renderBoostStocks();
            showToast('✅ ' + pendingItem.name + ' sotib olindi!', 'success');

        } else if (type === 'perm') {
            // Doimiy bonus
            await userRef.child('perms/' + id).set(true);
            myPerms[id] = true;
            renderPermButtons();
            showToast('🎉 ' + pendingItem.name + ' faollashtirildi!', 'success');
        }

        closeModal();

    } catch (e) {
        confirmBtn.disabled = false;
        showToast('Xatolik yuz berdi. Qayta urinib ko\'ring.', 'error');
    }
}

// =================== TOAST ===================
let toastTimer = null;
function showToast(msg, type) {
    const el = document.getElementById('bs-toast');
    el.textContent = msg;
    el.className = 'bs-toast ' + (type || '');
    el.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// =================== HELPERS ===================
function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// Bugungi kun boshi (00:00) timestamp
function getTodayStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
