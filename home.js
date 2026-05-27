/* =============================================
   DEXO SNAKE — HOME PAGE
   home.js  (Firebase CDN compat versiya)
============================================= */

// =================== FIREBASE CONFIG ===================
const firebaseConfig = {
    apiKey: "AIzaSyCtxk7gcilx1Be8k44SQ32eio6EBmh8IVc",
    authDomain: "loyiha1-773ba.firebaseapp.com",
    databaseURL: "https://loyiha1-773ba-default-rtdb.firebaseio.com",
    projectId: "loyiha1-773ba",
    storageBucket: "loyiha1-773ba.firebasestorage.app",
    messagingSenderId: "612930407157",
    appId: "1:612930407157:web:32036c06746c1edd8f93bc",
    measurementId: "G-NNEM3ZLW95"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// =================== TELEGRAM ===================
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

// =================== FOYDALANUVCHI MA'LUMOTLARI ===================
// Telegram ichida ishlayotganda haqiqiy ID olish
let userId   = null;
let userName = 'Mehmon';
let userLastName = '';

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    const tgUser = tg.initDataUnsafe.user;
    userId       = String(tgUser.id);
    userName     = tgUser.first_name || 'User';
    userLastName = tgUser.last_name  || '';
} else {
    // Brauzerda test uchun — haqiqiy qurilmada bu blok ishlamaydi
    userId   = 'test_' + Math.floor(Math.random() * 99999);
    userName = 'Test User';
}

const fullName = (userName + ' ' + userLastName).trim();

// =================== DOM TAYYOR BO'LGANDA ===================
document.addEventListener('DOMContentLoaded', () => {

    const usernameEl     = document.getElementById('username');
    const avatarEl       = document.getElementById('user-avatar');
    const balanceEl      = document.getElementById('ton-balance');
    const userIdEl       = document.getElementById('user-id');
    const multiplayerBtn = document.getElementById('btn-multiplayer');

    // ---- Darhol ismni ko'rsatish ----
    if (usernameEl) usernameEl.textContent = fullName;
    if (avatarEl)   avatarEl.textContent   = fullName.charAt(0).toUpperCase();
    if (userIdEl)   userIdEl.textContent   = 'ID: ' + userId;

    // ---- Firebase dan balans yuklash ----
    const userRef = database.ref('users/' + userId);

    userRef.once('value').then(snapshot => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const bal  = parseFloat(data.balance || 0).toFixed(5);
            if (balanceEl) balanceEl.textContent = bal + ' TON';

            // Ismni Firebase'da ham yangilab qo'yamiz
            userRef.update({ username: fullName });
        } else {
            // Yangi foydalanuvchi — Firebase'ga yozish
            userRef.set({
                username: fullName,
                telegramId: userId,
                balance: 0,
                createdAt: Date.now(),
                game_state: {
                    score: 0,
                    snake_size: 3,
                    status: 'lobby'
                }
            });
            if (balanceEl) balanceEl.textContent = '0.00000 TON';
        }
    }).catch(err => {
        console.error('Firebase xato:', err);
        if (balanceEl) balanceEl.textContent = '0.00000 TON';
    });

    // ---- Realtime balans yangilanishi ----
    userRef.child('balance').on('value', snap => {
        const bal = parseFloat(snap.val() || 0).toFixed(5);
        if (balanceEl) balanceEl.textContent = bal + ' TON';
    });

    // ---- MULTIPLAYER tugmasi ----
    if (multiplayerBtn) {
        multiplayerBtn.addEventListener('click', () => {
            userRef.child('game_state').set({
                score: 0,
                snake_size: 3,
                status: 'waiting'
            }).then(() => {
                window.location.href = 'game.html';
            }).catch(() => {
                window.location.href = 'game.html';
            });
        });
    }
});
