import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, onValue } from "firebase/database";

// Firebase konfiguratsiyasi
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

// Firebase-ni ishga tushirish
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Telegram WebApp obyektini tekshirish
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand(); // Ilovani toʻliq ekranga ochish
}

// Defolt (test) foydalanuvchi ma'lumotlari (agar Telegramdan tashqarida ochilsa)
let userId = "test_user_123";
let userName = "Guest Developer";

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    userId = tg.initDataUnsafe.user.id.toString();
    userName = tg.initDataUnsafe.user.first_name || "User";
}

// UI Elementlarini yuklash
document.addEventListener("DOMContentLoaded", () => {
    const usernameEl = document.getElementById("username");
    const avatarEl = document.getElementById("user-avatar");
    const balanceEl = document.getElementById("ton-balance");
    const multiplayerBtn = document.getElementById("btn-multiplayer");

    // UI interfeysni dastlabki sozlash
    usernameEl.textContent = userName;
    avatarEl.textContent = userName.charAt(0).toUpperCase();

    // Foydalanuvchi ma'lumotlarini bazadan yuklash va eshitish (Realtime)
    const userRef = ref(database, 'users/' + userId);
    
    onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            // Balansni yangilash
            if (data.balance !== undefined) {
                balanceEl.textContent = parseFloat(data.balance).toFixed(5) + " TON";
            }
        } else {
            // Yangi foydalanuvchi boʻlsa, bazaga boshlangʻich qiymatlarni yozish
            set(userRef, {
                username: userName,
                balance: 0.00000,
                game_state: {
                    score: 0,
                    snake_size: 3,
                    status: "lobby"
                }
            });
            balanceEl.textContent = "0.00000 TON";
        }
    });

    // Oʻyinga oʻtish tugmasi hodisasi
    multiplayerBtn.addEventListener("click", () => {
        // Oʻyin holatini bazada 'waiting' (kutish) rejimiga oʻtkazish
        const gameStateRef = ref(database, 'users/' + userId + '/game_state');
        set(gameStateRef, {
            score: 0,
            snake_size: 3,
            status: "waiting"
        }).then(() => {
            window.location.href = "game.html";
        });
    });
});
