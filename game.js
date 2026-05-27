import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";

// Firebase konfiguratsiyasi (Tizim ishlashi va kelajakda xonalarni sinxron qilish uchun)
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

// Telegram WebApp sozlamalari
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    // Foydalanuvchiga qulay bo'lishi uchun Telegram BackButton-ni ham faollashtirish mumkin
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        window.location.href = "home.html";
    });
}

document.addEventListener("DOMContentLoaded", () => {
    // Agar Telegramdan tashqarida brauzerda ochilsa, konsolda tekshirish
    console.log("DEXO Snake o'yin rejimlari sahifasi tayyor.");
    
    // Kerak bo'lsa, har bir tugma bosilganda foydalanuvchining oxirgi holatini 
    // Firebase bazasida yangilash logikasini shu yerga yozish mumkin.
});
