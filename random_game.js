/* =============================================
   DEXO SNAKE — RANDOM GAME
   random_game.js
   1. Firebase'dan bo'sh xona qidiradi
   2. Topsa — shu sahifada to'g'ridan o'yinni boshlaydi
   3. Topilmasa — yangi xona ochib o'yinni boshlaydi
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
const MAX_PLAYERS  = 30;
const ZONE         = 3000;
const CELL         = 20;
const FOOD_CNT     = 120;
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

let myTgId = 'rand_' + Math.floor(Math.random() * 999999);
let myName = 'Player';
if (tg?.initDataUnsafe?.user) {
    myTgId = String(tg.initDataUnsafe.user.id);
    myName = tg.initDataUnsafe.user.first_name || 'Player';
}

// =================== SEARCH STATE ===================
let searching   = false;
let foundRoomId = null;
let myColor     = SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)];
let isOwner     = false;

// =================== GAME STATE ===================
let canvas, ctx, minimapCanvas, minimapCtx;
let cameraX = 0, cameraY = 0;
let mySnake     = null;
let allSnakes   = {};
let allFoods    = {};
let boostActive = false;
let myBalance   = 0;
let gameRunning = false;
let gameTickTimer = null;
let snakeRef    = null;
let currentRoomId = null;

// Joystick
let joystickActive = false;
let joystickAngle  = 0;
let joystickDist   = 0;
const JOYSTICK_RADIUS = 55;

// =================== DOM ===================
const searchScreen = document.getElementById('search-screen');
const gameScreen   = document.getElementById('game-screen');
const deathScreen  = document.getElementById('death-screen');
const stateIdle      = document.getElementById('state-idle');
const stateSearching = document.getElementById('state-searching');
const stateFound     = document.getElementById('state-found');
const stateNew       = document.getElementById('state-new');

// =================== INIT ===================
document.addEventListener('DOMContentLoaded', () => {
    canvas        = document.getElementById('game-canvas');
    ctx           = canvas.getContext('2d');
    minimapCanvas = document.getElementById('minimap');
    minimapCtx    = minimapCanvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    loadBalance();
    setupSearchButtons();
    setupJoystick();
    setupBoost();
    setupDeathScreen();
    setupKeyboard();
});

function resizeCanvas() {
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
}

// =================== BALANS ===================
function loadBalance() {
    db.ref(`users/${myTgId}/balance`).once('value').then(snap => {
        myBalance = parseFloat(snap.val() || 0);
        updateHUD();
    });
}

// =================== QIDIRUV TUGMALARI ===================
function setupSearchButtons() {
    document.getElementById('btn-find').addEventListener('click', startSearch);
    document.getElementById('btn-cancel').addEventListener('click', cancelSearch);
    document.getElementById('back-btn').addEventListener('click', e => {
        if (searching) {
            e.preventDefault();
            cancelSearch();
            setTimeout(() => { window.location.href = 'game.html'; }, 200);
        }
    });
}

function startSearch() {
    if (searching) return;
    searching = true;
    showSearchState('searching');
    runSearchFlow();
}

function cancelSearch() {
    searching = false;
    showSearchState('idle');
    resetSteps();
}

// =================== ASOSIY QIDIRUV OQIMI ===================
async function runSearchFlow() {

    // Qadam 1: Firebase ulanish
    await delay(600);
    if (!searching) return;
    setStep(1, 'active');
    await delay(700);
    if (!searching) return;
    setStep(1, 'done');

    // Qadam 2: Bo'sh xonalarni tekshirish
    await delay(300);
    if (!searching) return;
    setStep(2, 'active');

    let availableRoom = null;
    try {
        const snap = await db.ref('rooms')
            .orderByChild('status').equalTo('waiting').once('value');
        if (snap.exists()) {
            const rooms = snap.val();
            for (const [roomId, room] of Object.entries(rooms)) {
                const pCount = room.players ? Object.keys(room.players).length : 0;
                // O'zimning xonamga emas, boshqasiga kirish
                if (pCount < MAX_PLAYERS && roomId !== myTgId) {
                    availableRoom = { id: roomId, room, playerCount: pCount };
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

    // Qadam 3: Qo'shilish
    await delay(300);
    if (!searching) return;
    setStep(3, 'active');

    if (availableRoom) {
        await joinExistingRoom(availableRoom.id, availableRoom.playerCount);
        await delay(500);
        if (!searching) return;
        setStep(3, 'done');
        await delay(200);
        showFoundAndEnter(availableRoom.id, availableRoom.playerCount + 1);
    } else {
        await delay(400);
        if (!searching) return;
        setStep(3, 'done');
        showSearchState('new');
        await createAndEnterNewRoom();
    }
}

// =================== MAVJUD XONAGA QO'SHILISH ===================
async function joinExistingRoom(roomId, currentCount) {
    isOwner = false;
    currentRoomId = roomId;
    foundRoomId = roomId;

    const colorIdx = Math.floor(Math.random() * SNAKE_COLORS.length);
    myColor = SNAKE_COLORS[colorIdx];

    const playerRef = db.ref(`rooms/${roomId}/players/${myTgId}`);
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
}

// =================== YANGI XONA YARATISH ===================
async function createAndEnterNewRoom() {
    await delay(500);
    isOwner = true;
    currentRoomId = myTgId;
    foundRoomId = myTgId;
    myColor = SNAKE_COLORS[0];

    try {
        await db.ref(`rooms/${currentRoomId}`).set({
            owner: myTgId,
            status: 'waiting',
            createdAt: Date.now(),
            maxPlayers: MAX_PLAYERS,
        });

        const foods = {};
        for (let i = 0; i < FOOD_CNT; i++) {
            foods['f' + i] = {
                x: snapGrid(rand(50, ZONE - 50)),
                y: snapGrid(rand(50, ZONE - 50))
            };
        }
        await db.ref(`rooms/${currentRoomId}/foods`).set(foods);

        const spawnX = snapGrid(rand(200, ZONE - 200));
        const spawnY = snapGrid(rand(200, ZONE - 200));

        const playerRef = db.ref(`rooms/${currentRoomId}/players/${myTgId}`);
        await playerRef.set({
            name: myName,
            color1: myColor[0],
            color2: myColor[1],
            joinedAt: Date.now(),
            alive: true,
            score: 0,
            spawnX,
            spawnY,
        });
        playerRef.onDisconnect().remove();
        db.ref(`rooms/${currentRoomId}`).onDisconnect().remove();

    } catch (e) {
        console.error('Yangi xona xatosi:', e);
    }

    await delay(800);
    if (!searching) return;
    showFoundAndEnter(currentRoomId, 1);
}

// =================== TOPILDI → O'YINGA KIRISH ===================
function showFoundAndEnter(roomId, players) {
    searching = false;
    showSearchState('found');

    document.getElementById('found-room-id').textContent = roomId;
    document.getElementById('found-players').textContent = players + '/' + MAX_PLAYERS;

    let progress = 0;
    const fill = document.getElementById('enter-fill');

    const interval = setInterval(() => {
        progress += 2.5;
        fill.style.width = Math.min(progress, 100) + '%';
        if (progress >= 100) {
            clearInterval(interval);
            // Lobby'ni yashirib TO'G'RIDAN O'YINNI BOSHLASH
            setTimeout(() => launchGame(), 200);
        }
    }, 40);
}

// =================== O'YINNI BOSHLASH ===================
async function launchGame() {
    // Sahifalarni almashtirish
    searchScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    // Mening spawn joyimni olish
    const myPlayerSnap = await db.ref(`rooms/${currentRoomId}/players/${myTgId}`).once('value');
    const myPlayerData = myPlayerSnap.val() || {};
    const sx = myPlayerData.spawnX || snapGrid(rand(200, ZONE - 200));
    const sy = myPlayerData.spawnY || snapGrid(rand(200, ZONE - 200));

    // O'yin holatini boshlash
    gameRunning = true;

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

    // Firebase'ga o'z snake'imni yozish
    snakeRef = db.ref(`rooms/${currentRoomId}/snakes/${myTgId}`);
    await writeMySnake();
    snakeRef.onDisconnect().remove();

    // Agar owner bo'lsam — xona statusini 'playing' ga o'tkaz
    if (isOwner) {
        await db.ref(`rooms/${currentRoomId}/status`).set('playing');
    }

    // Ovqatlar kuzatish
    db.ref(`rooms/${currentRoomId}/foods`).on('value', snap => {
        allFoods = snap.val() || {};
    });

    // Boshqa ilonlar kuzatish
    db.ref(`rooms/${currentRoomId}/snakes`).on('value', snap => {
        allSnakes = snap.val() || {};
        updateHUD();
    });

    // Camera
    cameraX = sx - window.innerWidth  / 2;
    cameraY = sy - window.innerHeight / 2;

    // Game tick
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

    applyJoystickDir();

    const opp = { right:'left', left:'right', up:'down', down:'up' };
    if (mySnake.nextDir !== opp[mySnake.dir]) mySnake.dir = mySnake.nextDir;

    const head  = mySnake.segments[0];
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
    if (nx < 0 || ny < 0 || nx >= ZONE || ny >= ZONE) { die(null); return; }

    // O'z tanasi
    for (let i = 3; i < mySnake.segments.length; i++) {
        const seg = mySnake.segments[i];
        if (Math.abs(nx - seg.x) < CELL * 0.7 && Math.abs(ny - seg.y) < CELL * 0.7) {
            die(null); return;
        }
    }

    // Boshqa ilonlar
    for (const [uid, snake] of Object.entries(allSnakes)) {
        if (uid === myTgId || !snake.alive) continue;
        for (const seg of (snake.segments || [])) {
            if (Math.abs(nx - seg.x) < CELL * 0.8 && Math.abs(ny - seg.y) < CELL * 0.8) {
                die(uid); return;
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
            db.ref(`rooms/${currentRoomId}/foods/${fid}`).remove();
            if (isOwner) {
                const nfid = 'fn_' + Date.now() + '_' + Math.random().toString(36).slice(2);
                db.ref(`rooms/${currentRoomId}/foods/${nfid}`).set({
                    x: snapGrid(rand(50, ZONE - 50)),
                    y: snapGrid(rand(50, ZONE - 50)),
                });
            }
            break;
        }
    }

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
    snakeRef.set({
        segments: mySnake.segments.slice(0, 60),
        dir: mySnake.dir,
        alive: true,
        score: mySnake.score,
        color1: myColor[0],
        color2: myColor[1],
        name: myName,
        uid: myTgId,
    });
}

// =================== O'LIM ===================
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
    if (snakeRef) await snakeRef.remove();
    if (Object.keys(updates).length) await db.ref().update(updates);

    // Killerga TON berish
    if (killerUid) {
        db.ref(`users/${killerUid}/balance`).transaction(bal => {
            return (parseFloat(bal) || 0) + 0.0001;
        });
    }

    // Listener'larni o'chirish
    db.ref(`rooms/${currentRoomId}/foods`).off();
    db.ref(`rooms/${currentRoomId}/snakes`).off();

    // O'lim ekrani
    document.getElementById('death-score').textContent = mySnake.score;
    gameScreen.classList.add('hidden');
    deathScreen.classList.remove('hidden');
}

// =================== DEATH SCREEN ===================
function setupDeathScreen() {
    document.getElementById('btn-respawn').addEventListener('click', () => {
        // Hamma narsani reset qilib qidiruvga qaytish
        deathScreen.classList.add('hidden');
        searchScreen.classList.remove('hidden');
        showSearchState('idle');
        resetSteps();
        allSnakes = {};
        allFoods  = {};
        mySnake   = null;
        snakeRef  = null;
        currentRoomId = null;
        foundRoomId   = null;
        gameRunning   = false;
        loadBalance();
    });
}

// =================== RENDER LOOP ===================
function renderLoop() {
    if (!canvas || !ctx) { requestAnimationFrame(renderLoop); return; }
    if (!gameRunning && !mySnake) { requestAnimationFrame(renderLoop); return; }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground(cameraX, cameraY);

    // Ovqatlar
    for (const food of Object.values(allFoods)) {
        const sx = food.x - cameraX;
        const sy = food.y - cameraY;
        if (sx < -20 || sy < -20 || sx > canvas.width + 20 || sy > canvas.height + 20) continue;
        drawFood(sx, sy);
    }

    // Boshqa ilonlar
    for (const [uid, snake] of Object.entries(allSnakes)) {
        if (uid === myTgId || !snake.alive) continue;
        drawSnake(snake.segments || [], snake.color1, snake.color2, cameraX, cameraY, snake.name, false);
    }

    // Mening ilonim
    if (mySnake && mySnake.alive) {
        drawSnake(mySnake.segments, myColor[0], myColor[1], cameraX, cameraY, myName, true);
    }

    drawMinimap();
    requestAnimationFrame(renderLoop);
}

// =================== DRAW BACKGROUND ===================
function drawBackground(cx, cy) {
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(0,229,255,0.04)';
    ctx.lineWidth = 1;
    const gs = 50;
    const offX = (-(cx % gs) + gs) % gs;
    const offY = (-(cy % gs) + gs) % gs;
    for (let x = offX; x < canvas.width + gs; x += gs) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = offY; y < canvas.height + gs; y += gs) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Neon chegara
    const zx = 0 - cx, zy = 0 - cy;
    ctx.strokeStyle = '#ff3366';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#ff3366';
    ctx.shadowBlur = 20;
    ctx.strokeRect(zx, zy, ZONE, ZONE);
    ctx.shadowBlur = 0;
}

// =================== DRAW FOOD ===================
function drawFood(sx, sy) {
    const pulse = 1 + Math.sin(Date.now() / 500 + sx * 0.1) * 0.15;
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
    if (!segments || !segments.length) return;
    for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        const sx = seg.x - cx;
        const sy = seg.y - cy;
        if (sx < -30 || sy < -30 || sx > canvas.width + 30 || sy > canvas.height + 30) continue;
        const ratio = i / segments.length;
        const r = CELL / 2 * (1 - ratio * 0.3);
        ctx.save();
        ctx.globalAlpha = 1 - ratio * 0.2;
        if (isMe) { ctx.shadowColor = color1; ctx.shadowBlur = 8; }
        const grd = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, 0, sx, sy, r);
        grd.addColorStop(0, color1);
        grd.addColorStop(1, color2);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    const head = segments[0];
    const hsx  = head.x - cx;
    const hsy  = head.y - cy;
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hsx + 4, hsy - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hsx - 4, hsy - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(hsx + 4, hsy - 3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hsx - 4, hsy - 3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (name) {
        ctx.save();
        ctx.font = 'bold 11px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = isMe ? '#00e5ff' : '#ffffff';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
        ctx.fillText(name, hsx, hsy - CELL - 4);
        ctx.restore();
    }
}

// =================== MINIMAP ===================
function drawMinimap() {
    const mc    = minimapCtx;
    const mw    = minimapCanvas.width;
    const mh    = minimapCanvas.height;
    const scale = mw / ZONE;
    mc.clearRect(0, 0, mw, mh);
    mc.fillStyle = 'rgba(6,8,15,0.85)';
    mc.fillRect(0, 0, mw, mh);
    mc.fillStyle = '#ff007f';
    for (const food of Object.values(allFoods)) {
        mc.fillRect(food.x * scale, food.y * scale, 2, 2);
    }
    for (const [uid, snake] of Object.entries(allSnakes)) {
        if (uid === myTgId || !snake.alive || !snake.segments?.[0]) continue;
        mc.fillStyle = snake.color1 || '#ff9900';
        mc.beginPath();
        mc.arc(snake.segments[0].x * scale, snake.segments[0].y * scale, 2.5, 0, Math.PI * 2);
        mc.fill();
    }
    if (mySnake?.segments?.[0]) {
        mc.fillStyle = myColor[0];
        mc.shadowColor = myColor[0]; mc.shadowBlur = 4;
        mc.beginPath();
        mc.arc(mySnake.segments[0].x * scale, mySnake.segments[0].y * scale, 3.5, 0, Math.PI * 2);
        mc.fill();
        mc.shadowBlur = 0;
    }
    mc.strokeStyle = 'rgba(0,229,255,0.4)';
    mc.lineWidth = 1;
    mc.strokeRect(cameraX * scale, cameraY * scale,
        window.innerWidth * scale, window.innerHeight * scale);
}

// =================== JOYSTICK ===================
function setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');

    function getCenter() {
        const r = base.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    function onStart(e) {
        e.preventDefault();
        joystickActive = true;
    }
    function onMove(e) {
        if (!joystickActive) return;
        e.preventDefault();
        const touch  = e.touches ? e.touches[0] : e;
        const center = getCenter();
        const dx = touch.clientX - center.x;
        const dy = touch.clientY - center.y;
        const dist  = Math.sqrt(dx * dx + dy * dy);
        joystickAngle = Math.atan2(dy, dx);
        joystickDist  = Math.min(dist / JOYSTICK_RADIUS, 1);
        const kx = Math.cos(joystickAngle) * Math.min(dist, JOYSTICK_RADIUS);
        const ky = Math.sin(joystickAngle) * Math.min(dist, JOYSTICK_RADIUS);
        knob.style.transform = `translate(${kx}px, ${ky}px)`;
    }
    function onEnd() {
        joystickActive = false;
        joystickDist   = 0;
        knob.style.transform = 'translate(0,0)';
    }
    zone.addEventListener('touchstart',    onStart, { passive: false });
    zone.addEventListener('touchmove',     onMove,  { passive: false });
    zone.addEventListener('touchend',      onEnd);
    zone.addEventListener('mousedown',     onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onEnd);
}

function applyJoystickDir() {
    if (!joystickActive || joystickDist < 0.25 || !mySnake) return;
    const opp = { right:'left', left:'right', up:'down', down:'up' };
    let dir;
    const a = joystickAngle;
    if (a > -Math.PI / 4 && a <= Math.PI / 4)            dir = 'right';
    else if (a > Math.PI / 4 && a <= 3 * Math.PI / 4)    dir = 'down';
    else if (a > 3 * Math.PI / 4 || a <= -3 * Math.PI/4) dir = 'left';
    else                                                   dir = 'up';
    if (dir && dir !== opp[mySnake.dir]) mySnake.nextDir = dir;
}

// =================== BOOST ===================
function setupBoost() {
    const btn = document.getElementById('boost-btn');
    btn.addEventListener('touchstart', e => { e.preventDefault(); boostActive = true; btn.style.transform = 'scale(.93)'; }, { passive: false });
    btn.addEventListener('touchend',   ()  => { boostActive = false; btn.style.transform = ''; });
    btn.addEventListener('mousedown',  ()  => { boostActive = true; });
    document.addEventListener('mouseup', () => { boostActive = false; });
}

// =================== KLAVIATURA ===================
function setupKeyboard() {
    const keyMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
                     w:'up', s:'down', a:'left', d:'right',
                     W:'up', S:'down', A:'left', D:'right' };
    const opp    = { right:'left', left:'right', up:'down', down:'up' };
    document.addEventListener('keydown', e => {
        if (!mySnake || !mySnake.alive) return;
        const d = keyMap[e.key];
        if (d && d !== opp[mySnake.dir]) { mySnake.nextDir = d; e.preventDefault(); }
        if (e.key === ' ') boostActive = true;
    });
    document.addEventListener('keyup', e => { if (e.key === ' ') boostActive = false; });
}

// =================== HUD ===================
function updateHUD() {
    const b = document.getElementById('hud-balance');
    const s = document.getElementById('hud-score');
    const p = document.getElementById('hud-players');
    if (b) b.textContent = myBalance.toFixed(5);
    if (s && mySnake) s.textContent = mySnake.score;
    if (p) p.textContent = Object.keys(allSnakes).length || 1;
}

// =================== QIDIRUV UI HELPERLAR ===================
function showSearchState(name) {
    stateIdle.classList.add('hidden');
    stateSearching.classList.add('hidden');
    stateFound.classList.add('hidden');
    stateNew.classList.add('hidden');
    const map = { idle: stateIdle, searching: stateSearching, found: stateFound, new: stateNew };
    if (map[name]) map[name].classList.remove('hidden');
}

function setStep(num, state) {
    const stepEl   = document.getElementById('step-' + num);
    const statusEl = document.getElementById('status-' + num);
    if (!stepEl) return;
    stepEl.classList.remove('active', 'done');
    if (state === 'active') { stepEl.classList.add('active'); statusEl.textContent = '⏳'; }
    if (state === 'done')   { stepEl.classList.add('done');   statusEl.textContent = '✅'; }
}

function resetSteps() {
    [1, 2, 3].forEach(n => {
        const s  = document.getElementById('step-' + n);
        const st = document.getElementById('status-' + n);
        if (s)  s.classList.remove('active', 'done');
        if (st) st.textContent = '⏳';
    });
}

// =================== HELPERS ===================
function delay(ms)          { return new Promise(res => setTimeout(res, ms)); }
function snapGrid(v)        { return Math.round(v / CELL) * CELL; }
function rand(min, max)     { return Math.floor(Math.random() * (max - min)) + min; }
