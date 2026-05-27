/* =============================================
   DEXO SNAKE — ONLINE ARENA
   Firebase Realtime DB + Telegram Mini App
   create_game.js
============================================= */

// =================== FIREBASE CONFIG ===================
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
const ZONE         = 3000;
const CELL         = 20;
const FOOD_CNT     = 120;
const MAX_PLAYERS  = 30;
const TICK_MS      = 100;
const BOOST_MULT   = 2;
const SNAKE_COLORS = [
    ['#00e5ff','#0055ff'], ['#ff3399','#aa00ff'],
    ['#00ffa3','#008844'], ['#ffcc00','#ff6600'],
    ['#ff6b6b','#c0392b'], ['#a29bfe','#6c5ce7'],
    ['#fd79a8','#e84393'], ['#55efc4','#00b894'],
];

// =================== TELEGRAM ===================
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

let myTgId   = 'user_' + Math.floor(Math.random()*999999);
let myName   = 'Player';
let myColor  = null;

if (tg?.initDataUnsafe?.user) {
    myTgId  = String(tg.initDataUnsafe.user.id);
    myName  = tg.initDataUnsafe.user.first_name || 'Player';
}

// =================== STATE ===================
let currentRoomId = null;
let isOwner       = false;
let myBalance     = 0;
let gameRunning   = false;
let gameTickTimer = null;
let roomRef       = null;
let snakeRef      = null;
let playersRef    = null;

// Local game state
let canvas, ctx, minimapCanvas, minimapCtx;
let cameraX = 0, cameraY = 0;
let mySnake   = null;    // { segments:[{x,y}], dir, nextDir, alive, score, eatenFoods }
let allSnakes = {};      // uid -> snake data from Firebase
let allFoods  = {};      // foodId -> {x,y}
let boostActive = false;
let earnedTon   = 0;

// Joystick
let joystickActive = false;
let joystickAngle  = 0;
let joystickDist   = 0;
let joystickStartX = 0;
let joystickStartY = 0;
const JOYSTICK_RADIUS = 55;

// =================== DOM ===================
const lobbyScreen  = document.getElementById('lobby-screen');
const gameScreen   = document.getElementById('game-screen');
const deathScreen  = document.getElementById('death-screen');

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', () => {
    canvas       = document.getElementById('game-canvas');
    ctx          = canvas.getContext('2d');
    minimapCanvas= document.getElementById('minimap');
    minimapCtx   = minimapCanvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    loadBalance();
    setupTabs();
    setupLobbyButtons();
    setupJoystick();
    setupBoost();
    setupDeathScreen();
});

function resizeCanvas() {
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
}

// =================== BALANCE ===================
function loadBalance() {
    db.ref(`users/${myTgId}/balance`).once('value').then(snap => {
        myBalance = parseFloat(snap.val() || 0);
        updateHUD();
    });
}

function saveBalance(newBal) {
    myBalance = newBal;
    db.ref(`users/${myTgId}`).update({ balance: parseFloat(newBal.toFixed(5)), username: myName });
    updateHUD();
}

// =================== TABS ===================
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
    });
}

// =================== LOBBY BUTTONS ===================
function setupLobbyButtons() {
    // Create room
    document.getElementById('btn-create-room').addEventListener('click', createRoom);

    // Search room
    document.getElementById('btn-search-room').addEventListener('click', searchRoom);
    document.getElementById('room-id-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') searchRoom();
    });

    // Join room
    document.getElementById('btn-join-room').addEventListener('click', joinFoundRoom);

    // Copy room id
    document.getElementById('btn-copy-id').addEventListener('click', () => {
        navigator.clipboard?.writeText(currentRoomId).catch(()=>{});
        toast('ID nusxalandi! 📋');
    });

    // Start game (owner)
    document.getElementById('btn-start-game').addEventListener('click', ownerStartGame);
}

// =================== CREATE ROOM ===================
async function createRoom() {
    const btn = document.getElementById('btn-create-room');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'YARATILMOQDA...';

    isOwner = true;
    currentRoomId = myTgId; // Xona ID = yaratuvchi telegram ID
    myColor = SNAKE_COLORS[0];

    roomRef    = db.ref(`rooms/${currentRoomId}`);
    playersRef = db.ref(`rooms/${currentRoomId}/players`);

    await roomRef.set({
        owner: myTgId,
        status: 'waiting',
        createdAt: Date.now(),
        maxPlayers: MAX_PLAYERS,
    });

    // Ovqatlarni yaratish (room owner qiladi)
    const foods = {};
    for (let i = 0; i < FOOD_CNT; i++) {
        const fid = 'f' + i;
        foods[fid] = {
            x: snapGrid(rand(50, ZONE - 50)),
            y: snapGrid(rand(50, ZONE - 50))
        };
    }
    await db.ref(`rooms/${currentRoomId}/foods`).set(foods);

    // O'zimni qo'shish
    await addMeToRoom();

    showWaitingRoom();
    listenRoom();

    btn.disabled = false;
    btn.querySelector('span').textContent = 'XONA YARATISH';
}

// =================== SEARCH ROOM ===================
async function searchRoom() {
    const input = document.getElementById('room-id-input').value.trim();
    const resultEl = document.getElementById('search-result');
    const joinBtn  = document.getElementById('btn-join-room');

    if (!input) { toast('ID kiriting!'); return; }

    resultEl.classList.remove('hidden','error');
    resultEl.textContent = '🔍 Qidirilmoqda...';

    const snap = await db.ref(`rooms/${input}`).once('value');
    if (!snap.exists()) {
        resultEl.classList.add('error');
        resultEl.textContent = '❌ Xona topilmadi. ID ni tekshiring.';
        joinBtn.classList.add('hidden');
        return;
    }

    const room = snap.val();
    if (room.status === 'playing') {
        resultEl.classList.add('error');
        resultEl.textContent = '⚠️ O\'yin allaqachon boshlangan.';
        joinBtn.classList.add('hidden');
        return;
    }

    const playerCount = room.players ? Object.keys(room.players).length : 0;
    if (playerCount >= MAX_PLAYERS) {
        resultEl.classList.add('error');
        resultEl.textContent = '⚠️ Xona to\'la (30/30).';
        joinBtn.classList.add('hidden');
        return;
    }

    resultEl.textContent = `✅ Xona topildi! O'yinchilar: ${playerCount}/${MAX_PLAYERS}`;
    joinBtn.classList.remove('hidden');
    joinBtn.dataset.roomTarget = input;
}

// =================== JOIN FOUND ROOM ===================
async function joinFoundRoom() {
    const btn = document.getElementById('btn-join-room');
    const targetRoom = btn.dataset.roomTarget;
    if (!targetRoom) return;

    isOwner = false;
    currentRoomId = targetRoom;
    const colorIdx = Math.floor(Math.random() * SNAKE_COLORS.length);
    myColor = SNAKE_COLORS[colorIdx];

    roomRef    = db.ref(`rooms/${currentRoomId}`);
    playersRef = db.ref(`rooms/${currentRoomId}/players`);

    await addMeToRoom();
    showWaitingRoom();
    listenRoom();
}

// =================== ADD ME TO ROOM ===================
async function addMeToRoom() {
    await db.ref(`rooms/${currentRoomId}/players/${myTgId}`).set({
        name: myName,
        color1: myColor[0],
        color2: myColor[1],
        joinedAt: Date.now(),
        alive: true,
        score: 0,
    });

    // Disconnect bo'lganda o'chirish
    db.ref(`rooms/${currentRoomId}/players/${myTgId}`).onDisconnect().remove();
}

// =================== SHOW WAITING ROOM ===================
function showWaitingRoom() {
    document.getElementById('tab-create').classList.remove('active');
    document.getElementById('tab-join').classList.remove('active');
    document.querySelector('.tab-switcher').style.display = 'none';
    document.getElementById('waiting-room').classList.remove('hidden');
    document.getElementById('display-room-id').textContent = currentRoomId;
    if (isOwner) document.getElementById('btn-start-game').classList.remove('hidden');
}

// =================== LISTEN ROOM ===================
function listenRoom() {
    // Oyinchilar listini kuzatish
    db.ref(`rooms/${currentRoomId}/players`).on('value', snap => {
        const players = snap.val() || {};
        renderPlayersList(players);
    });

    // Status kuzatish (owner start bosganida)
    db.ref(`rooms/${currentRoomId}/status`).on('value', snap => {
        if (snap.val() === 'playing' && !gameRunning) {
            startGame();
        }
    });
}

// =================== PLAYERS LIST UI ===================
function renderPlayersList(players) {
    const list = document.getElementById('players-list');
    const count = Object.keys(players).length;
    document.getElementById('player-count').textContent = count + '/' + MAX_PLAYERS;

    list.innerHTML = '';
    Object.entries(players).forEach(([uid, p]) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        const isMe = uid === myTgId;
        row.innerHTML = `
            <div class="player-avatar" style="background:linear-gradient(135deg,${p.color1},${p.color2})">
                ${p.name.charAt(0).toUpperCase()}
            </div>
            <span class="player-name">${p.name}</span>
            ${isMe ? '<span class="player-badge">SEN</span>' : ''}
            ${uid === currentRoomId ? '<span class="player-badge">HOST</span>' : ''}
        `;
        list.appendChild(row);
    });
}

// =================== OWNER START GAME ===================
async function ownerStartGame() {
    const snap = await db.ref(`rooms/${currentRoomId}/players`).once('value');
    const players = snap.val() || {};
    const count = Object.keys(players).length;

    if (count < 1) { toast('Kamida 1 o\'yinchi kerak!'); return; }

    // Barcha o'yinchilarni joylashtiramiz
    const positions = generateSpawnPositions(Object.keys(players));
    const updates   = {};
    Object.keys(players).forEach((uid, i) => {
        const pos = positions[i];
        updates[`rooms/${currentRoomId}/players/${uid}/spawnX`] = pos.x;
        updates[`rooms/${currentRoomId}/players/${uid}/spawnY`] = pos.y;
    });
    updates[`rooms/${currentRoomId}/status`] = 'playing';
    await db.ref().update(updates);
}

function generateSpawnPositions(uids) {
    return uids.map(() => ({
        x: snapGrid(rand(200, ZONE - 200)),
        y: snapGrid(rand(200, ZONE - 200))
    }));
}

// =================== START GAME ===================
async function startGame() {
    gameRunning = true;
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    // Spawn pozitsiyamni olish
    const myPlayerSnap = await db.ref(`rooms/${currentRoomId}/players/${myTgId}`).once('value');
    const myPlayerData = myPlayerSnap.val();
    const sx = myPlayerData.spawnX || snapGrid(rand(200, ZONE - 200));
    const sy = myPlayerData.spawnY || snapGrid(rand(200, ZONE - 200));

    // Local snake init
    earnedTon = 0;
    mySnake = {
        segments: buildInitSegments(sx, sy, 'right', 6),
        dir: 'right',
        nextDir: 'right',
        alive: true,
        score: 6,
        eatenFoods: [],
        color1: myColor[0],
        color2: myColor[1],
    };

    // Firebase'daki o'z snake'imni yozish
    snakeRef = db.ref(`rooms/${currentRoomId}/snakes/${myTgId}`);
    await writeMySnake();
    snakeRef.onDisconnect().remove();

    // Ovqatlarni kuzatish
    db.ref(`rooms/${currentRoomId}/foods`).on('value', snap => {
        allFoods = snap.val() || {};
    });

    // Boshqa ilonlarni kuzatish
    db.ref(`rooms/${currentRoomId}/snakes`).on('value', snap => {
        allSnakes = snap.val() || {};
    });

    cameraX = sx - window.innerWidth  / 2;
    cameraY = sy - window.innerHeight / 2;

    // Game loop
    gameTickTimer = setInterval(gameTick, TICK_MS);

    // Render loop
    requestAnimationFrame(renderLoop);

    updateHUD();
}

function buildInitSegments(x, y, dir, len) {
    const segs = [];
    for (let i = 0; i < len; i++) {
        segs.push({
            x: x - i * (dir === 'right' ? CELL : dir === 'left' ? -CELL : 0),
            y: y - i * (dir === 'down'  ? CELL : dir === 'up'   ? -CELL : 0),
        });
    }
    return segs;
}

// =================== GAME TICK ===================
function gameTick() {
    if (!gameRunning || !mySnake || !mySnake.alive) return;

    // Joystick yoki direction'ga ko'ra nextDir yangilash
    applyJoystickDir();

    const opp = { right:'left', left:'right', up:'down', down:'up' };
    if (mySnake.nextDir !== opp[mySnake.dir]) mySnake.dir = mySnake.nextDir;

    const head = mySnake.segments[0];
    const speed = boostActive ? BOOST_MULT : 1;

    let nx = head.x;
    let ny = head.y;

    for (let s = 0; s < speed; s++) {
        if (mySnake.dir === 'right') nx += CELL;
        if (mySnake.dir === 'left')  nx -= CELL;
        if (mySnake.dir === 'up')    ny -= CELL;
        if (mySnake.dir === 'down')  ny += CELL;
    }

    // Chegara
    if (nx < 0 || ny < 0 || nx >= ZONE || ny >= ZONE) {
        die(null);
        return;
    }

    // O'z tanasiga tegish
    for (let i = 3; i < mySnake.segments.length; i++) {
        const seg = mySnake.segments[i];
        if (Math.abs(nx - seg.x) < CELL * 0.7 && Math.abs(ny - seg.y) < CELL * 0.7) {
            die(null);
            return;
        }
    }

    // Boshqa ilonlarga tegish (Firebase'dan)
    for (const [uid, snake] of Object.entries(allSnakes)) {
        if (uid === myTgId || !snake.alive) continue;
        for (const seg of (snake.segments || [])) {
            if (Math.abs(nx - seg.x) < CELL * 0.8 && Math.abs(ny - seg.y) < CELL * 0.8) {
                die(uid);
                return;
            }
        }
    }

    // Ovqat yeyish
    let ate = false;
    for (const [fid, food] of Object.entries(allFoods)) {
        if (Math.abs(nx - food.x) < CELL * 0.9 && Math.abs(ny - food.y) < CELL * 0.9) {
            mySnake.eatenFoods.push({ x: food.x, y: food.y });
            mySnake.score++;
            ate = true;
            // Firebase'dan ovqatni o'chirish
            db.ref(`rooms/${currentRoomId}/foods/${fid}`).remove();
            // Yangi ovqat qo'shish (faqat owner)
            if (isOwner) {
                const nfid = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2);
                db.ref(`rooms/${currentRoomId}/foods/${nfid}`).set({
                    x: snapGrid(rand(50, ZONE - 50)),
                    y: snapGrid(rand(50, ZONE - 50)),
                });
            }
            break;
        }
    }

    // Snake harakati
    mySnake.segments.unshift({ x: nx, y: ny });
    if (!ate) mySnake.segments.pop();

    // Camera
    cameraX = nx - window.innerWidth  / 2;
    cameraY = ny - window.innerHeight / 2;
    cameraX = Math.max(0, Math.min(cameraX, ZONE - window.innerWidth));
    cameraY = Math.max(0, Math.min(cameraY, ZONE - window.innerHeight));

    writeMySnake();
    updateHUD();
}

async function writeMySnake() {
    if (!snakeRef) return;
    await snakeRef.set({
        segments: mySnake.segments.slice(0, 50), // Firebase uchun limitlash
        dir: mySnake.dir,
        alive: true,
        score: mySnake.score,
        color1: myColor[0],
        color2: myColor[1],
        name: myName,
        uid: myTgId,
    });
}

// =================== DIE ===================
async function die(killerUid) {
    if (!mySnake || !mySnake.alive) return;
    mySnake.alive = false;
    gameRunning = false;
    clearInterval(gameTickTimer);

    // Yegan ovqatlarni qaytarish
    const updates = {};
    mySnake.eatenFoods.forEach(pos => {
        const fid = 'fd_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        updates[`rooms/${currentRoomId}/foods/${fid}`] = pos;
    });

    // O'z snake'imni o'chirish
    if (snakeRef) await snakeRef.remove();

    // Ovqatlarni qaytarish
    if (Object.keys(updates).length) await db.ref().update(updates);

    // Killer'ga TON berish
    if (killerUid) {
        db.ref(`users/${killerUid}/balance`).transaction(bal => {
            return (parseFloat(bal) || 0) + 0.0001;
        });
    }

    // Death screen
    document.getElementById('death-score').textContent = mySnake.score;
    document.getElementById('death-earned').textContent = '+' + earnedTon.toFixed(4) + ' TON';
    gameScreen.classList.add('hidden');
    deathScreen.classList.remove('hidden');

    // Listener tozalash
    db.ref(`rooms/${currentRoomId}/foods`).off();
    db.ref(`rooms/${currentRoomId}/snakes`).off();
    db.ref(`rooms/${currentRoomId}/status`).off();
    db.ref(`rooms/${currentRoomId}/players`).off();
}

// =================== RESPAWN ===================
function setupDeathScreen() {
    document.getElementById('btn-respawn').addEventListener('click', async () => {
        deathScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        gameRunning = false;
        allSnakes = {};
        allFoods  = {};
        mySnake   = null;
        currentRoomId = null;
        roomRef = null;
        snakeRef = null;
        document.getElementById('waiting-room').classList.add('hidden');
        document.querySelector('.tab-switcher').style.display = '';
        document.getElementById('tab-create').classList.add('active');
        document.getElementById('btn-join-room').classList.add('hidden');
        document.getElementById('search-result').classList.add('hidden');
        await loadBalance();
    });
}

// =================== RENDER LOOP ===================
function renderLoop() {
    if (!canvas || !ctx) { requestAnimationFrame(renderLoop); return; }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!gameRunning && !mySnake) { requestAnimationFrame(renderLoop); return; }

    const cx = cameraX;
    const cy = cameraY;

    // Background
    drawBackground(cx, cy);

    // Ovqatlar
    for (const food of Object.values(allFoods)) {
        const sx = food.x - cx;
        const sy = food.y - cy;
        if (sx < -20 || sy < -20 || sx > canvas.width + 20 || sy > canvas.height + 20) continue;
        drawFood(sx, sy);
    }

    // Boshqa ilonlar
    for (const [uid, snake] of Object.entries(allSnakes)) {
        if (uid === myTgId || !snake.alive) continue;
        drawSnake(snake.segments || [], snake.color1, snake.color2, cx, cy, snake.name);
    }

    // Mening ilonim
    if (mySnake && mySnake.alive) {
        drawSnake(mySnake.segments, myColor[0], myColor[1], cx, cy, myName, true);
    }

    // Minimap
    drawMinimap();

    requestAnimationFrame(renderLoop);
}

// =================== DRAW BACKGROUND ===================
function drawBackground(cx, cy) {
    // Dark base
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(0,229,255,0.04)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    const offX = (-(cx % gridSize) + gridSize) % gridSize;
    const offY = (-(cy % gridSize) + gridSize) % gridSize;

    for (let x = offX; x < canvas.width + gridSize; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = offY; y < canvas.height + gridSize; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Zona chegarasini chizish
    const zx1 = 0 - cx, zy1 = 0 - cy;
    const zx2 = ZONE - cx, zy2 = ZONE - cy;

    ctx.strokeStyle = '#ff3366';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#ff3366';
    ctx.shadowBlur = 20;
    ctx.strokeRect(zx1, zy1, ZONE, ZONE);
    ctx.shadowBlur = 0;

    // Chegara ichiga qizil gradient
    const grad = ctx.createLinearGradient(zx1, zy1, zx1 + 60, zy1);
    grad.addColorStop(0, 'rgba(255,51,102,0.12)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(zx1, zy1, 60, ZONE);
    const gradR = ctx.createLinearGradient(zx2 - 60, zy1, zx2, zy1);
    gradR.addColorStop(0, 'transparent');
    gradR.addColorStop(1, 'rgba(255,51,102,0.12)');
    ctx.fillStyle = gradR;
    ctx.fillRect(zx2 - 60, zy1, 60, ZONE);
}

// =================== DRAW FOOD ===================
function drawFood(sx, sy) {
    const time = Date.now() / 500;
    const pulse = 1 + Math.sin(time + sx * 0.1) * 0.15;
    const r = 7 * pulse;

    ctx.save();
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 12;
    const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    grd.addColorStop(0, '#ffaadd');
    grd.addColorStop(0.5, '#ff007f');
    grd.addColorStop(1, '#aa0044');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// =================== DRAW SNAKE ===================
function drawSnake(segments, color1, color2, cx, cy, name, isMe) {
    if (!segments || segments.length === 0) return;

    for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        const sx = seg.x - cx;
        const sy = seg.y - cy;
        if (sx < -30 || sy < -30 || sx > canvas.width + 30 || sy > canvas.height + 30) continue;

        const ratio = i / segments.length;
        const r = CELL / 2 * (1 - ratio * 0.3);
        const alpha = 1 - ratio * 0.2;

        ctx.save();
        ctx.globalAlpha = alpha;

        if (isMe) {
            ctx.shadowColor = color1;
            ctx.shadowBlur = 8;
        }

        const grd = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, 0, sx, sy, r);
        grd.addColorStop(0, color1);
        grd.addColorStop(1, color2);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Bosh
    const head = segments[0];
    const hsx = head.x - cx;
    const hsy = head.y - cy;

    // Ko'zlar
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hsx + 4, hsy - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hsx - 4, hsy - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(hsx + 4, hsy - 3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hsx - 4, hsy - 3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Nom
    if (name) {
        ctx.save();
        ctx.font = 'bold 11px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = isMe ? '#00e5ff' : '#ffffff';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText(name, hsx, hsy - CELL - 4);
        ctx.restore();
    }
}

// =================== MINIMAP ===================
function drawMinimap() {
    const mc = minimapCtx;
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;
    const scale = mw / ZONE;

    mc.clearRect(0, 0, mw, mh);
    mc.fillStyle = 'rgba(6,8,15,0.85)';
    mc.fillRect(0, 0, mw, mh);

    // Ovqatlar
    mc.fillStyle = '#ff007f';
    for (const food of Object.values(allFoods)) {
        mc.fillRect(food.x * scale, food.y * scale, 2, 2);
    }

    // Boshqa ilonlar
    for (const [uid, snake] of Object.entries(allSnakes)) {
        if (uid === myTgId || !snake.alive || !snake.segments?.[0]) continue;
        mc.fillStyle = snake.color1 || '#ff9900';
        mc.beginPath();
        mc.arc(snake.segments[0].x * scale, snake.segments[0].y * scale, 2.5, 0, Math.PI * 2);
        mc.fill();
    }

    // Mening ilonim
    if (mySnake?.segments?.[0]) {
        mc.fillStyle = myColor[0];
        mc.shadowColor = myColor[0];
        mc.shadowBlur = 4;
        mc.beginPath();
        mc.arc(mySnake.segments[0].x * scale, mySnake.segments[0].y * scale, 3.5, 0, Math.PI * 2);
        mc.fill();
        mc.shadowBlur = 0;
    }

    // Camera viewport ko'rsatish
    mc.strokeStyle = 'rgba(0,229,255,0.4)';
    mc.lineWidth = 1;
    mc.strokeRect(
        cameraX * scale, cameraY * scale,
        window.innerWidth * scale, window.innerHeight * scale
    );
}

// =================== JOYSTICK ===================
function setupJoystick() {
    const zone  = document.getElementById('joystick-zone');
    const base  = document.getElementById('joystick-base');
    const knob  = document.getElementById('joystick-knob');

    function getCenter() {
        const r = base.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function onStart(e) {
        e.preventDefault();
        joystickActive = true;
        const touch = e.touches ? e.touches[0] : e;
        joystickStartX = touch.clientX;
        joystickStartY = touch.clientY;
    }

    function onMove(e) {
        if (!joystickActive) return;
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        const center = getCenter();
        const dx = touch.clientX - center.x;
        const dy = touch.clientY - center.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        joystickAngle = angle;
        joystickDist  = Math.min(dist / JOYSTICK_RADIUS, 1);

        const kx = Math.cos(angle) * Math.min(dist, JOYSTICK_RADIUS);
        const ky = Math.sin(angle) * Math.min(dist, JOYSTICK_RADIUS);
        knob.style.transform = `translate(${kx}px, ${ky}px)`;
    }

    function onEnd(e) {
        joystickActive = false;
        joystickDist = 0;
        knob.style.transform = 'translate(0,0)';
    }

    zone.addEventListener('touchstart',  onStart, { passive: false });
    zone.addEventListener('touchmove',   onMove,  { passive: false });
    zone.addEventListener('touchend',    onEnd);
    zone.addEventListener('mousedown',   onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onEnd);
}

function applyJoystickDir() {
    if (!joystickActive || joystickDist < 0.25) return;
    const angle = joystickAngle; // radians
    const opp = { right:'left', left:'right', up:'down', down:'up' };

    let dir;
    if (angle > -Math.PI / 4 && angle <= Math.PI / 4)       dir = 'right';
    else if (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) dir = 'down';
    else if (angle > 3 * Math.PI / 4 || angle <= -3 * Math.PI / 4) dir = 'left';
    else dir = 'up';

    if (dir && dir !== opp[mySnake.dir]) mySnake.nextDir = dir;
}

// =================== BOOST ===================
function setupBoost() {
    const btn = document.getElementById('boost-btn');
    btn.addEventListener('touchstart',  e => { e.preventDefault(); boostActive = true; btn.style.transform = 'scale(.93)'; }, { passive: false });
    btn.addEventListener('touchend',    () => { boostActive = false; btn.style.transform = ''; });
    btn.addEventListener('mousedown',   () => { boostActive = true; });
    document.addEventListener('mouseup',() => { boostActive = false; });
}

// =================== KEYBOARD ===================
document.addEventListener('keydown', e => {
    if (!mySnake || !mySnake.alive) return;
    const map = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
                  w:'up', s:'down', a:'left', d:'right',
                  W:'up', S:'down', A:'left', D:'right' };
    const opp = { right:'left', left:'right', up:'down', down:'up' };
    const d = map[e.key];
    if (d && d !== opp[mySnake.dir]) { mySnake.nextDir = d; e.preventDefault(); }
    if (e.key === ' ') boostActive = true;
});
document.addEventListener('keyup', e => { if (e.key === ' ') boostActive = false; });

// =================== HUD ===================
function updateHUD() {
    const balEl = document.getElementById('hud-balance');
    const scrEl = document.getElementById('hud-score');
    const plEl  = document.getElementById('hud-players');
    if (balEl) balEl.textContent = myBalance.toFixed(5);
    if (scrEl && mySnake) scrEl.textContent = mySnake.score;
    if (plEl) plEl.textContent = Object.keys(allSnakes).length || 1;
}

// =================== HELPERS ===================
function snapGrid(v) { return Math.round(v / CELL) * CELL; }
function rand(min, max) { return Math.floor(Math.random() * (max - min)) + min; }

function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
}

function showFloatingMsg(text) {
    const el = document.createElement('div');
    el.className = 'floating-msg';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}
