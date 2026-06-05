/* =============================================
   DEXO SNAKE — RANDOM GAME
   random_game.js
   Firebase'dan bo'sh xona qidiradi, topsa
   o'yinga yo'naltiradi, topilmasa yangi ochadi.
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

// =================== CONSTANTS ===================
const MAX_PLAYERS = 30;
const ZONE        = 3000;
const CELL        = 20;
const FOOD_CNT    = 120;
const SNAKE_COLORS = [
    ['#00e5ff','#0055ff'], ['#ff3399','#aa00ff'],
    ['#00ffa3','#008844'], ['#ffcc00','#ff6600'],
    ['#ff6b6b','#c0392b'], ['#a29bfe','#6c5ce7'],
    ['#fd79a8','#e84393'], ['#55efc4','#00b894'],
];

// =================== TELEGRAM ===================
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

let myTgId  = 'rand_' + Math.floor(Math.random() * 999999);
let myName  = 'Player';
if (tg?.initDataUnsafe?.user) {
    myTgId = String(tg.initDataUnsafe.user.id);
    myName = tg.initDataUnsafe.user.first_name || 'Player';
}

// =================== STATE ===================
let searching     = false;
let foundRoomId   = null;
let myColor       = SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)];

// =================== DOM ===================
const stateIdle      = document.getElementById('state-idle');
const stateSearching = document.getElementById('state-searching');
const stateFound     = document.getElementById('state-found');
const stateNew       = document.getElementById('state-new');

// =================== TUGMALAR ===================
document.getElementById('btn-find').addEventListener('click', startSearch);
document.getElementById('btn-cancel').addEventListener('click', cancelSearch);
document.getElementById('back-btn').addEventListener('click', e => {
    if (searching) {
        e.preventDefault();
        cancelSearch();
        setTimeout(() => { window.location.href = 'game.html'; }, 300);
    }
});

// =================== QIDIRUVNI BOSHLASH ===================
function startSearch() {
    if (searching) return;
    searching = true;
    showState('searching');
    runSearchFlow();
}

function cancelSearch() {
    searching = false;
    showState('idle');
    resetSteps();
}

// =================== ASOSIY QIDIRUV LOGIKASI ===================
async function runSearchFlow() {

    // --- QADAM 1: Firebase serverga ulanish ---
    await delay(600);
    if (!searching) return;
    setStep(1, 'active');
    await delay(700);
    if (!searching) return;
    setStep(1, 'done');

    // --- QADAM 2: Bo'sh xonalarni tekshirish ---
    await delay(300);
    if (!searching) return;
    setStep(2, 'active');

    let availableRoom = null;
    try {
        const snap = await db.ref('rooms').orderByChild('status').equalTo('waiting').once('value');
        if (snap.exists()) {
            const rooms = snap.val();
            for (const [roomId, room] of Object.entries(rooms)) {
                const playerCount = room.players ? Object.keys(room.players).length : 0;
                if (playerCount < MAX_PLAYERS && roomId !== myTgId) {
                    availableRoom = { id: roomId, room, playerCount };
                    break;
                }
            }
        }
    } catch (e) {
        console.error('Firebase xato:', e);
    }

    await delay(800);
    if (!searching) return;
    setStep(2, 'done');

    // --- QADAM 3: Xonaga qo'shilish ---
    await delay(300);
    if (!searching) return;
    setStep(3, 'active');

    if (availableRoom) {
        // Mavjud bo'sh xona topildi
        await joinExistingRoom(availableRoom.id, availableRoom.playerCount);
    } else {
        // Bo'sh xona yo'q — yangi ochish
        await delay(500);
        if (!searching) return;
        setStep(3, 'done');
        await createNewRoom();
        return;
    }

    await delay(500);
    if (!searching) return;
    setStep(3, 'done');

    // --- TOPILDI EKRANI ---
    await delay(200);
    showFoundScreen(availableRoom.id, availableRoom.playerCount + 1);
}

// =================== MAVJUD XONAGA QO'SHILISH ===================
async function joinExistingRoom(roomId, currentCount) {
    try {
        const playerRef = db.ref(`rooms/${roomId}/players/${myTgId}`);
        await playerRef.set({
            name: myName,
            color1: myColor[0],
            color2: myColor[1],
            joinedAt: Date.now(),
            alive: true,
            score: 0,
        });
        playerRef.onDisconnect().remove();

        // Spawn pozitsiyasi
        await playerRef.update({
            spawnX: snapGrid(rand(200, ZONE - 200)),
            spawnY: snapGrid(rand(200, ZONE - 200)),
        });

        foundRoomId = roomId;
    } catch (e) {
        console.error('Xonaga qo\'shilish xatosi:', e);
    }
}

// =================== YANGI XONA YARATISH ===================
async function createNewRoom() {
    showState('new');
    await delay(600);

    const newRoomId = myTgId;
    foundRoomId = newRoomId;
    myColor = SNAKE_COLORS[0];

    try {
        // Xona yaratish
        await db.ref(`rooms/${newRoomId}`).set({
            owner: myTgId,
            status: 'waiting',
            createdAt: Date.now(),
            maxPlayers: MAX_PLAYERS,
        });

        // Ovqatlar
        const foods = {};
        for (let i = 0; i < FOOD_CNT; i++) {
            foods['f' + i] = {
                x: snapGrid(rand(50, ZONE - 50)),
                y: snapGrid(rand(50, ZONE - 50))
            };
        }
        await db.ref(`rooms/${newRoomId}/foods`).set(foods);

        // O'zimni qo'shish
        const playerRef = db.ref(`rooms/${newRoomId}/players/${myTgId}`);
        await playerRef.set({
            name: myName,
            color1: myColor[0],
            color2: myColor[1],
            joinedAt: Date.now(),
            alive: true,
            score: 0,
            spawnX: snapGrid(rand(200, ZONE - 200)),
            spawnY: snapGrid(rand(200, ZONE - 200)),
        });
        playerRef.onDisconnect().remove();
        db.ref(`rooms/${newRoomId}`).onDisconnect().remove();

    } catch (e) {
        console.error('Yangi xona xatosi:', e);
    }

    await delay(1200);
    if (!searching) return;
    showFoundScreen(newRoomId, 1);
}

// =================== TOPILDI EKRANI ===================
function showFoundScreen(roomId, players) {
    searching = false;
    showState('found');

    document.getElementById('found-room-id').textContent = roomId;
    document.getElementById('found-players').textContent = players + '/' + MAX_PLAYERS;

    // Progress bar → create_game.html ga o'tish
    let progress = 0;
    const fill = document.getElementById('enter-fill');
    const interval = setInterval(() => {
        progress += 2.5;
        fill.style.width = Math.min(progress, 100) + '%';
        if (progress >= 100) {
            clearInterval(interval);
            // roomId va myColor ni localStorage'ga saqlash
            localStorage.setItem('dexo_room_id',  foundRoomId);
            localStorage.setItem('dexo_is_owner', foundRoomId === myTgId ? '1' : '0');
            localStorage.setItem('dexo_color1',   myColor[0]);
            localStorage.setItem('dexo_color2',   myColor[1]);
            // O'yinga o'tish
            setTimeout(() => {
                window.location.href = 'create_game.html?room=' + encodeURIComponent(foundRoomId);
            }, 200);
        }
    }, 40); // ~4 sekund
}

// =================== HOLAT BOSHQARISH ===================
function showState(name) {
    stateIdle.classList.add('hidden');
    stateSearching.classList.add('hidden');
    stateFound.classList.add('hidden');
    stateNew.classList.add('hidden');

    const map = {
        idle:      stateIdle,
        searching: stateSearching,
        found:     stateFound,
        new:       stateNew,
    };
    if (map[name]) map[name].classList.remove('hidden');
}

// =================== QADAM BOSHQARISH ===================
function setStep(num, state) {
    const stepEl  = document.getElementById('step-' + num);
    const statusEl= document.getElementById('status-' + num);
    if (!stepEl) return;

    stepEl.classList.remove('active', 'done');
    if (state === 'active') {
        stepEl.classList.add('active');
        statusEl.textContent = '⏳';
    } else if (state === 'done') {
        stepEl.classList.add('done');
        statusEl.textContent = '✅';
    }
}

function resetSteps() {
    [1, 2, 3].forEach(n => {
        const s = document.getElementById('step-' + n);
        const st = document.getElementById('status-' + n);
        if (s)  { s.classList.remove('active', 'done'); }
        if (st) { st.textContent = '⏳'; }
    });
}

// =================== HELPERS ===================
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }
function snapGrid(v) { return Math.round(v / CELL) * CELL; }
function rand(min, max) { return Math.floor(Math.random() * (max - min)) + min; }
