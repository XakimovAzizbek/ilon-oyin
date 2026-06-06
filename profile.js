/* =============================================
   DEXO SNAKE — PROFILE PAGE
   profile.js
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
let userName = 'Mehmon';
let userLast = '';

if (tg?.initDataUnsafe?.user) {
    const u  = tg.initDataUnsafe.user;
    userId   = String(u.id);
    userName = u.first_name || 'User';
    userLast = u.last_name  || '';
}
const fullName = (userName + ' ' + userLast).trim();

// =================== GLOBAL ===================
let currentBalance = 0;

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', () => {

    // --- Darhol ismni ko'rsatish ---
    setEl('pf-avatar', fullName.charAt(0).toUpperCase());
    setEl('pf-name',   fullName);
    setEl('pf-id',     'ID: ' + userId);

    // --- Firebase dan ma'lumot yuklash ---
    const userRef = db.ref('users/' + userId);

    userRef.once('value').then(snap => {
        if (snap.exists()) {
            const d = snap.val();
            currentBalance = parseFloat(d.balance || 0);

            setEl('pf-balance', currentBalance.toFixed(5) + ' TON');
            setEl('st-games',   d.stats?.games   || 0);
            setEl('st-kills',   d.stats?.kills   || 0);
            setEl('st-maxlen',  d.stats?.maxLen  || 0);
            setEl('st-ton',     parseFloat(d.stats?.earned || 0).toFixed(3));

            setLevel(currentBalance, d.stats?.kills || 0);
            renderHistory(d.history || null);
            userRef.update({ username: fullName });
        } else {
            userRef.set({
                username:  fullName,
                telegramId: userId,
                balance:   0,
                createdAt: Date.now(),
                stats: { games:0, kills:0, maxLen:0, earned:0 }
            });
        }
    }).catch(() => {});

    // Realtime balans
    userRef.child('balance').on('value', snap => {
        currentBalance = parseFloat(snap.val() || 0);
        setEl('pf-balance', currentBalance.toFixed(5) + ' TON');
    });

    // --- Tugmalar ---
    document.getElementById('btn-withdraw').addEventListener('click', openWithdraw);

    setupWithdrawModal();
});

// =================== LEVEL ===================
function setLevel(balance, kills) {
    let label = '🐣 Yangi boshlagan';
    if (kills >= 100 || balance >= 0.1)  label = '🥉 Bronza';
    if (kills >= 300 || balance >= 0.5)  label = '🥈 Kumush';
    if (kills >= 700 || balance >= 1.0)  label = '🥇 Oltin';
    if (kills >= 1500|| balance >= 5.0)  label = '💎 Brilliant';
    setEl('pf-level', label);
}

// =================== HISTORY ===================
function renderHistory(history) {
    const el = document.getElementById('pf-history');
    if (!history) return;

    const items = Object.values(history)
        .sort((a, b) => b.time - a.time)
        .slice(0, 10);

    if (!items.length) return;

    el.innerHTML = '';
    items.forEach(g => {
        const win  = g.killed > 0;
        const date = new Date(g.time).toLocaleDateString('uz-UZ', {
            day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
        });
        const div = document.createElement('div');
        div.className = 'pf-hist-item';
        div.innerHTML = `
            <div class="pf-hist-ico ${win ? 'win' : 'lose'}">${win ? '🏆' : '💀'}</div>
            <div class="pf-hist-info">
                <div class="pf-hist-title">${win ? 'G\'olib' : 'Mag\'lub'} · Uzunlik: ${g.length || 0}</div>
                <div class="pf-hist-date">${date}</div>
            </div>
            <div class="pf-hist-right">
                <div class="pf-hist-len">+${g.killed || 0} o'ldirdi</div>
                <div class="pf-hist-ton ${g.ton > 0 ? 'p' : 'n'}">
                    ${g.ton > 0 ? '+' : ''}${parseFloat(g.ton || 0).toFixed(4)} TON
                </div>
            </div>`;
        el.appendChild(div);
    });
}

// =================== WITHDRAW MODAL ===================
function openWithdraw() {
    const overlay = document.getElementById('wd-overlay');
    // Avvalgi holatni reset
    document.getElementById('wd-form-view').classList.remove('hidden');
    document.getElementById('wd-ok-view').classList.add('hidden');
    document.getElementById('wd-addr').value = '';
    document.getElementById('wd-amt').value  = '';
    document.getElementById('wd-calc').classList.add('hidden');
    document.getElementById('wd-err').classList.add('hidden');
    document.getElementById('wd-err').textContent = '';
    document.querySelectorAll('.wd-qbtn').forEach(b => b.classList.remove('wd-qactive'));

    // Mavjud balansni ko'rsatish
    setEl('wd-avail', currentBalance.toFixed(5));

    overlay.classList.remove('hidden');
}

function closeWithdraw() {
    document.getElementById('wd-overlay').classList.add('hidden');
}

function setupWithdrawModal() {
    const overlay = document.getElementById('wd-overlay');
    const sheet   = document.getElementById('wd-sheet');
    const amtInput= document.getElementById('wd-amt');

    // Yopish
    document.getElementById('wd-x').addEventListener('click', closeWithdraw);

    // Overlay ga tashqari bosish → yopish
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeWithdraw();
    });

    // MAX tugmasi
    document.getElementById('wd-max').addEventListener('click', () => {
        const maxVal = Math.max(0, currentBalance - 0.001);
        amtInput.value = maxVal > 0 ? maxVal.toFixed(5) : '';
        updateCalc();
        clearQuick();
    });

    // Tezkor summalar
    document.querySelectorAll('.wd-qbtn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.wd-qbtn').forEach(b => b.classList.remove('wd-qactive'));
            btn.classList.add('wd-qactive');
            amtInput.value = btn.dataset.v;
            updateCalc();
        });
    });

    // Input o'zgarganda hisob yangilash
    amtInput.addEventListener('input', () => {
        clearQuick();
        updateCalc();
    });

    // Tasdiqlash
    document.getElementById('wd-submit').addEventListener('click', submitWithdraw);

    // Done tugma (success ekranida)
    document.getElementById('wd-done').addEventListener('click', closeWithdraw);
}

function clearQuick() {
    document.querySelectorAll('.wd-qbtn').forEach(b => b.classList.remove('wd-qactive'));
}

function updateCalc() {
    const amt     = parseFloat(document.getElementById('wd-amt').value) || 0;
    const calcEl  = document.getElementById('wd-calc');
    const amtEl   = document.getElementById('wc-amt');
    const getEl   = document.getElementById('wc-get');

    if (amt > 0) {
        const receive = Math.max(0, amt - 0.001);
        amtEl.textContent = amt.toFixed(5) + ' TON';
        getEl.textContent = receive.toFixed(5) + ' TON';
        calcEl.classList.remove('hidden');
    } else {
        calcEl.classList.add('hidden');
    }
}

async function submitWithdraw() {
    const addr    = document.getElementById('wd-addr').value.trim();
    const amt     = parseFloat(document.getElementById('wd-amt').value) || 0;
    const errEl   = document.getElementById('wd-err');
    const submitBtn = document.getElementById('wd-submit');

    // Validatsiya
    errEl.classList.add('hidden');
    errEl.textContent = '';

    if (!addr || addr.length < 20) {
        showErr('Noto\'g\'ri hamyon manzili. Qayta tekshiring.');
        return;
    }
    if (amt < 0.001) {
        showErr('Minimal miqdor: 0.001 TON');
        return;
    }
    if (amt > currentBalance) {
        showErr('Balans yetarli emas! Mavjud: ' + currentBalance.toFixed(5) + ' TON');
        return;
    }

    // Yuborilmoqda...
    submitBtn.disabled = true;
    document.getElementById('wd-submit-txt').textContent = 'YUBORILMOQDA...';

    try {
        // Firebase'ga withdraw so'rov yozish
        const reqRef = db.ref('withdrawals/' + userId).push();
        await reqRef.set({
            uid:      userId,
            name:     fullName,
            address:  addr,
            amount:   amt,
            fee:      0.001,
            receive:  Math.max(0, amt - 0.001),
            status:   'pending',
            createdAt: Date.now(),
        });

        // Balansdan ayirish
        await db.ref('users/' + userId + '/balance').transaction(bal => {
            return Math.max(0, (parseFloat(bal) || 0) - amt);
        });

        // Success ekranini ko'rsatish
        document.getElementById('wd-form-view').classList.add('hidden');
        document.getElementById('wd-ok-view').classList.remove('hidden');

    } catch (e) {
        showErr('Xatolik yuz berdi. Qayta urinib ko\'ring.');
        submitBtn.disabled = false;
        document.getElementById('wd-submit-txt').textContent = 'TASDIQLASH';
    }
}

function showErr(msg) {
    const el = document.getElementById('wd-err');
    el.textContent = msg;
    el.classList.remove('hidden');
}

// =================== HELPER ===================
function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
