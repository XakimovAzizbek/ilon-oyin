/* =============================================
   DEXO SNAKE — RANDOM GAME
   random_game.js  (Market + Boost integratsiyasi)
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

// Default ilon rengi (skin yo'q bo'lsa)
const SNAKE_COLORS = [
    ['#00e5ff','#0055ff'], ['#ff3399','#aa00ff'],
    ['#00ffa3','#008844'], ['#ffcc00','#ff6600'],
    ['#ff6b6b','#c0392b'], ['#a29bfe','#6c5ce7'],
    ['#fd79a8','#e84393'], ['#55efc4','#00b894'],
];

// =================== SKIN → RANG MAPPING ===================
// Marketdan sotib olingan skin IDlari → ilon ranglari
const SKIN_COLORS = {
    neon:   ['#00e5ff', '#0011ff'],
    galaxy: ['#c084fc', '#7c3aed'],
    fire:   ['#ff6b00', '#ff0000'],
    ice:    ['#a5f3fc', '#0ea5e9'],
    gold:   ['#ffd700', '#b8860b'],
    matrix: ['#00ff41', '#007a1f'],
};

// Skin → fon turi (background theme)
const SKIN_THEMES = {
    neon:   'neon',
    galaxy: 'galaxy',
    fire:   'fire',
    ice:    'ice',
    gold:   'gold',
    matrix: 'matrix',
};

// Arena → fon turi
const ARENA_THEMES = {
    arena_space:  'space',
    arena_ocean:  'ocean',
    arena_lava:   'lava',
    arena_matrix: 'matrix_arena',
};

// Ovqat skin → draw funksiyasi nomi
const FOOD_SKINS = ['food_apple','food_diamond','food_star','food_coin'];

// =================== TELEGRAM ===================
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

let myTgId = 'rand_' + Math.floor(Math.random() * 999999);
let myName = 'Player';
if (tg?.initDataUnsafe?.user) {
    myTgId = String(tg.initDataUnsafe.user.id);
    myName = tg.initDataUnsafe.user.first_name || 'Player';
}

// =================== FOYDALANUVCHI MA'LUMOTLARI ===================
// (Firebase dan yuklanadi)
let myBalance     = 0;
let myMarketItems = {};   // { galaxy: { expiresAt:... }, ... }
let myPerms       = {};   // { startlen: true, multiplier: true, ... }
let myBoosts      = {};   // { speed: 2, shield: 1, ... }

// Aktiv skin/tema (yuklanganidan keyin aniqlanadi)
let activeSkin     = null;   // 'galaxy' | 'neon' | null
let activeArena    = null;   // 'arena_space' | null
let activeFoodSkin = null;   // 'food_diamond' | null
let hasMultiplier  = false;
let hasStartLen    = false;  // uzun boshlanish perm
let boostStocks    = {};     // { speed:2, shield:1, ... }

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
const searchScreen   = document.getElementById('search-screen');
const gameScreen     = document.getElementById('game-screen');
const deathScreen    = document.getElementById('death-screen');
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

    // Avval foydalanuvchi ma'lumotlarini yuklaymiz
    loadUserData();
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

// =================== FOYDALANUVCHI MA'LUMOTLARI YUKLASH ===================
function loadUserData() {
    db.ref('users/' + myTgId).once('value').then(snap => {
        if (!snap.exists()) {
            myBalance = 0;
            updateHUD();
            return;
        }
        const d = snap.val();
        myBalance     = parseFloat(d.balance   || 0);
        myMarketItems = d.market_items || {};
        myPerms       = d.perms        || {};
        myBoosts      = d.boosts       || {};

        // Aktiv skin aniqlash (muddati o'tmagan)
        const now = Date.now();
        activeSkin     = null;
        activeArena    = null;
        activeFoodSkin = null;

        // Skin tekshirish
        for (const skinId of Object.keys(SKIN_COLORS)) {
            if (myMarketItems[skinId] && myMarketItems[skinId].expiresAt > now) {
                activeSkin = skinId;
                break; // Birinchi aktiv skinni oladi
            }
        }

        // Arena tekshirish
        for (const arenaId of Object.keys(ARENA_THEMES)) {
            if (myMarketItems[arenaId] && myMarketItems[arenaId].expiresAt > now) {
                activeArena = arenaId;
                break;
            }
        }

        // Ovqat skin
        for (const fid of FOOD_SKINS) {
            if (myMarketItems[fid] && myMarketItems[fid].expiresAt > now) {
                activeFoodSkin = fid;
                break;
            }
        }

        // Perms
        hasStartLen    = !!myPerms.startlen;
        hasMultiplier  = !!myPerms.multiplier;

        // Boost stoklari
        boostStocks = {};
        for (const bId of ['speed','shield','magnet','blast']) {
            boostStocks[bId] = parseInt(myBoosts[bId] || 0);
        }

        // Skin rangini o'rnatish
        if (activeSkin && SKIN_COLORS[activeSkin]) {
            myColor = SKIN_COLORS[activeSkin];
        } else {
            myColor = SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)];
        }

        updateHUD();
        renderBoostUI();

    }).catch(err => {
        console.error('userData yuklash xatosi:', err);
        updateHUD();
    });

    // Realtime balans
    db.ref('users/' + myTgId + '/balance').on('value', snap => {
        myBalance = parseFloat(snap.val() || 0);
        updateHUD();
    });
}

// =================== BOOST UI ===================
function renderBoostUI() {
    // Agar boost tugmalari bo'lsa, stokni ko'rsatish
    const boostBtn = document.getElementById('boost-btn');
    if (!boostBtn) return;

    const speedStock = boostStocks.speed || 0;
    // Boost tugmasi ustida stok ko'rsatish
    let boostLabel = boostBtn.querySelector('.boost-label');
    if (boostLabel) {
        if (speedStock > 0) {
            boostLabel.textContent = 'BOOST ×' + speedStock;
        } else {
            boostLabel.textContent = 'BOOST';
        }
    }
}

// =================== QIDIRUV TUGMALARI ===================
function setupSearchButtons() {
    document.getElementById('btn-find').addEventListener('click', startSearch);
    document.getElementById('btn-cancel').addEventListener('click', cancelSearch);
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', e => {
            if (searching) {
                e.preventDefault();
                cancelSearch();
                setTimeout(() => { window.location.href = 'game.html'; }, 200);
            }
        });
    }
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
    await delay(600);
    if (!searching) return;
    setStep(1, 'active');
    await delay(700);
    if (!searching) return;
    setStep(1, 'done');

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

    const playerRef = db.ref(`rooms/${roomId}/players/${myTgId}`);
    await playerRef.set({
        name:      myName,
        color1:    myColor[0],
        color2:    myColor[1],
        skin:      activeSkin || '',
        joinedAt:  Date.now(),
        alive:     true,
        score:     0,
        spawnX:    snapGrid(rand(200, ZONE - 200)),
        spawnY:    snapGrid(rand(200, ZONE - 200)),
    });
    playerRef.onDisconnect().remove();
}

// =================== YANGI XONA YARATISH ===================
async function createAndEnterNewRoom() {
    await delay(500);
    isOwner = true;
    currentRoomId = myTgId;
    foundRoomId   = myTgId;

    try {
        await db.ref(`rooms/${currentRoomId}`).set({
            owner:      myTgId,
            status:     'waiting',
            createdAt:  Date.now(),
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
            name:      myName,
            color1:    myColor[0],
            color2:    myColor[1],
            skin:      activeSkin || '',
            joinedAt:  Date.now(),
            alive:     true,
            score:     0,
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

    const roomEl = document.getElementById('found-room-id');
    const plEl   = document.getElementById('found-players');
    if (roomEl) roomEl.textContent = roomId;
    if (plEl)   plEl.textContent  = players + '/' + MAX_PLAYERS;

    let progress = 0;
    const fill = document.getElementById('enter-fill');

    const interval = setInterval(() => {
        progress += 2.5;
        if (fill) fill.style.width = Math.min(progress, 100) + '%';
        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => launchGame(), 200);
        }
    }, 40);
}

// =================== O'YINNI BOSHLASH ===================
async function launchGame() {
    searchScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    // Mening spawn joyimni olish
    const myPlayerSnap = await db.ref(`rooms/${currentRoomId}/players/${myTgId}`).once('value');
    const myPlayerData = myPlayerSnap.val() || {};
    const sx = myPlayerData.spawnX || snapGrid(rand(200, ZONE - 200));
    const sy = myPlayerData.spawnY || snapGrid(rand(200, ZONE - 200));

    // ===== STARTLEN PERM: 6 o'rniga 10 segment =====
    const startLen = hasStartLen ? 10 : 6;

    gameRunning = true;

    mySnake = {
        segments:   buildInitSegments(sx, sy, 'right', startLen),
        dir:        'right',
        nextDir:    'right',
        alive:      true,
        score:      startLen,
        eatenFoods: [],
        color1:     myColor[0],
        color2:     myColor[1],
    };

    // HUD da skin belgisini ko'rsatish
    updateSkinHUD();

    // Firebase'ga o'z snake'imni yozish
    snakeRef = db.ref(`rooms/${currentRoomId}/snakes/${myTgId}`);
    await writeMySnake();
    snakeRef.onDisconnect().remove();

    if (isOwner) {
        await db.ref(`rooms/${currentRoomId}/status`).set('playing');
    }

    // Ovqatlar
    db.ref(`rooms/${currentRoomId}/foods`).on('value', snap => {
        allFoods = snap.val() || {};
    });

    // Boshqa ilonlar
    db.ref(`rooms/${currentRoomId}/snakes`).on('value', snap => {
        allSnakes = snap.val() || {};
        updateHUD();
    });

    // Camera
    cameraX = sx - window.innerWidth  / 2;
    cameraY = sy - window.innerHeight / 2;

    gameTickTimer = setInterval(gameTick, TICK_MS);
    requestAnimationFrame(renderLoop);
    updateHUD();
}

// =================== HUD SKIN KO'RSATISH ===================
function updateSkinHUD() {
    // Aktiv skin/arena belgisini o'yinda ko'rsatish
    const hudCenter = document.querySelector('.hud-center');
    if (!hudCenter) return;

    let badges = '';
    if (activeSkin)     badges += getSkinEmoji(activeSkin) + ' ';
    if (activeArena)    badges += getArenaEmoji(activeArena) + ' ';
    if (hasMultiplier)  badges += '💰 ';
    if (hasStartLen)    badges += '🐍 ';

    if (badges) {
        // Mavjud badge div bo'lmasa yaratamiz
        let badgeEl = document.getElementById('hud-skin-badge');
        if (!badgeEl) {
            badgeEl = document.createElement('div');
            badgeEl.id = 'hud-skin-badge';
            badgeEl.style.cssText = `
                position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
                background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.15);
                border-radius: 20px; padding: 4px 12px; font-size: 13px; color: #fff;
                z-index: 999; display: flex; gap: 4px; align-items: center;
                backdrop-filter: blur(4px);
            `;
            document.body.appendChild(badgeEl);
        }
        badgeEl.textContent = badges.trim();
    }
}

function getSkinEmoji(skinId) {
    const map = { neon:'⚡', galaxy:'🌌', fire:'🔥', ice:'❄️', gold:'👑', matrix:'💚' };
    return map[skinId] || '';
}
function getArenaEmoji(arenaId) {
    const map = { arena_space:'🚀', arena_ocean:'🌊', arena_lava:'🌋', arena_matrix:'💚' };
    return map[arenaId] || '';
}

// =================== SEGMENT BUILDER ===================
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
        segments: mySnake.segments.slice(0, 80),
        dir:      mySnake.dir,
        alive:    true,
        score:    mySnake.score,
        color1:   myColor[0],
        color2:   myColor[1],
        skin:     activeSkin || '',
        name:     myName,
        uid:      myTgId,
    });
}

// =================== O'LIM ===================
async function die(killerUid) {
    if (!mySnake || !mySnake.alive) return;
    mySnake.alive = false;
    gameRunning   = false;
    clearInterval(gameTickTimer);

    // Yegan ovqatlarni qaytarish
    const updates = {};
    mySnake.eatenFoods.forEach(pos => {
        const fid = 'fd_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        updates[`rooms/${currentRoomId}/foods/${fid}`] = pos;
    });
    if (snakeRef) await snakeRef.remove();
    if (Object.keys(updates).length) await db.ref().update(updates);

    // TON hisoblash
    // Multiplier perm bo'lsa 2x
    const baseEarn   = mySnake.score * 0.0001;
    const totalEarn  = hasMultiplier ? baseEarn * 2 : baseEarn;

    // Killerga TON berish
    if (killerUid) {
        db.ref(`users/${killerUid}/balance`).transaction(bal => {
            return (parseFloat(bal) || 0) + 0.0001;
        });
    }

    // O'z balansga qo'shish (ovqat yeyish uchun)
    if (totalEarn > 0) {
        await db.ref(`users/${myTgId}/balance`).transaction(bal => {
            return parseFloat((parseFloat(bal) || 0) + totalEarn).toFixed(5) * 1;
        });
    }

    // Listener'larni o'chirish
    db.ref(`rooms/${currentRoomId}/foods`).off();
    db.ref(`rooms/${currentRoomId}/snakes`).off();
    db.ref('users/' + myTgId + '/balance').off();

    // HUD badge yashirish
    const badge = document.getElementById('hud-skin-badge');
    if (badge) badge.style.display = 'none';

    // O'lim ekrani
    const deathScore   = document.getElementById('death-score');
    const deathEarned  = document.getElementById('death-earned');
    if (deathScore)  deathScore.textContent  = mySnake.score;
    if (deathEarned) deathEarned.textContent = '+' + totalEarn.toFixed(5) + ' TON';

    gameScreen.classList.add('hidden');
    deathScreen.classList.remove('hidden');
}

// =================== DEATH SCREEN ===================
function setupDeathScreen() {
    document.getElementById('btn-respawn').addEventListener('click', () => {
        deathScreen.classList.add('hidden');
        searchScreen.classList.remove('hidden');
        showSearchState('idle');
        resetSteps();

        // Hamma reset
        allSnakes     = {};
        allFoods      = {};
        mySnake       = null;
        snakeRef      = null;
        currentRoomId = null;
        foundRoomId   = null;
        gameRunning   = false;

        // Badge qayta ko'rsatish
        const badge = document.getElementById('hud-skin-badge');
        if (badge) badge.style.display = '';

        // Ma'lumotlarni qayta yuklash (o'yinchi yani skin sotib olgan bo'lishi mumkin)
        loadUserData();
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
        // Boshqa ilon skinini ham ko'rsatish
        const sc = getSnakeColors(snake.skin, snake.color1, snake.color2);
        drawSnake(snake.segments || [], sc[0], sc[1], cameraX, cameraY, snake.name, false, snake.skin);
    }

    // Mening ilonim
    if (mySnake && mySnake.alive) {
        drawSnake(mySnake.segments, myColor[0], myColor[1], cameraX, cameraY, myName, true, activeSkin);
    }

    drawMinimap();
    requestAnimationFrame(renderLoop);
}

// Boshqa ilon uchun rang olish
function getSnakeColors(skin, c1, c2) {
    if (skin && SKIN_COLORS[skin]) return SKIN_COLORS[skin];
    return [c1 || '#00e5ff', c2 || '#0055ff'];
}

// =================== DRAW BACKGROUND ===================
function drawBackground(cx, cy) {
    // Arena skin
    if (activeArena === 'arena_space') {
        drawSpaceBackground(cx, cy);
    } else if (activeArena === 'arena_ocean') {
        drawOceanBackground(cx, cy);
    } else if (activeArena === 'arena_lava') {
        drawLavaBackground(cx, cy);
    } else if (activeArena === 'arena_matrix') {
        drawMatrixBackground(cx, cy);
    } else {
        drawDefaultBackground(cx, cy);
    }

    // Chegara (har doim)
    drawZoneBorder(cx, cy);
}

function drawDefaultBackground(cx, cy) {
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(cx, cy, 'rgba(0,229,255,0.04)');
}

function drawSpaceBackground(cx, cy) {
    ctx.fillStyle = '#000010';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Yulduzlar
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const starSeed = 42;
    for (let i = 0; i < 80; i++) {
        const sx = ((i * 137.5 + cx * 0.05) % canvas.width + canvas.width) % canvas.width;
        const sy = ((i * 97.3  + cy * 0.05) % canvas.height + canvas.height) % canvas.height;
        const r  = (i % 3 === 0) ? 1.5 : 0.8;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
    drawGrid(cx, cy, 'rgba(120,80,255,0.05)');
}

function drawOceanBackground(cx, cy) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#001a33');
    grad.addColorStop(1, '#003366');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(cx, cy, 'rgba(0,150,255,0.07)');
}

function drawLavaBackground(cx, cy) {
    ctx.fillStyle = '#1a0000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Lava crack effekti (oddiy grid bilan)
    drawGrid(cx, cy, 'rgba(255,60,0,0.08)');
    // Sutki effekti
    const t = Date.now() / 2000;
    const glow = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, 10,
        canvas.width/2, canvas.height/2, canvas.width/2
    );
    glow.addColorStop(0, 'rgba(255,40,0,0.06)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawMatrixBackground(cx, cy) {
    ctx.fillStyle = '#000800';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(cx, cy, 'rgba(0,255,65,0.06)');
}

function drawGrid(cx, cy, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const gs   = 50;
    const offX = (-(cx % gs) + gs) % gs;
    const offY = (-(cy % gs) + gs) % gs;
    for (let x = offX; x < canvas.width + gs; x += gs) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = offY; y < canvas.height + gs; y += gs) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

function drawZoneBorder(cx, cy) {
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

    if (activeFoodSkin === 'food_diamond') {
        // 💎 Olmos shakli
        ctx.save();
        ctx.shadowColor = '#00cfff';
        ctx.shadowBlur  = 14;
        ctx.fillStyle   = '#00cfff';
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r * 0.6, sy);
        ctx.lineTo(sx, sy + r);
        ctx.lineTo(sx - r * 0.6, sy);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

    } else if (activeFoodSkin === 'food_star') {
        // ⭐ Yulduz shakli
        ctx.save();
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur  = 14;
        ctx.fillStyle   = '#ffd700';
        drawStar(ctx, sx, sy, 5, r, r * 0.4);
        ctx.restore();

    } else if (activeFoodSkin === 'food_coin') {
        // 🪙 Tanga
        ctx.save();
        ctx.shadowColor = '#f4a100';
        ctx.shadowBlur  = 10;
        const grd = ctx.createRadialGradient(sx - r*0.2, sy - r*0.2, 0, sx, sy, r);
        grd.addColorStop(0, '#ffe066');
        grd.addColorStop(1, '#b87000');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.7, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

    } else if (activeFoodSkin === 'food_apple') {
        // 🍎 Olma (qizil doira + yashil barg)
        ctx.save();
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur  = 10;
        ctx.fillStyle   = '#ff3333';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#33cc33';
        ctx.beginPath(); ctx.ellipse(sx + r*0.3, sy - r*0.9, r*0.3, r*0.15, 0.5, 0, Math.PI*2); ctx.fill();
        ctx.restore();

    } else {
        // Default: gradient doira
        ctx.save();
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur  = 12;
        const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        grd.addColorStop(0, '#ffaadd');
        grd.addColorStop(0.5, '#ff007f');
        grd.addColorStop(1, '#aa0044');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

// Yulduz chizish yordamchi
function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
        ctx.lineTo(
            cx + Math.cos(rot) * outerR,
            cy + Math.sin(rot) * outerR
        );
        rot += step;
        ctx.lineTo(
            cx + Math.cos(rot) * innerR,
            cy + Math.sin(rot) * innerR
        );
        rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fill();
}

// =================== DRAW SNAKE ===================
function drawSnake(segments, color1, color2, cx, cy, name, isMe, skin) {
    if (!segments || !segments.length) return;

    // Galaxy skin: ilon tanasida yulduz effekti
    const isGalaxy = skin === 'galaxy';
    const isMatrix = skin === 'matrix';
    const isNeon   = skin === 'neon';
    const isFire   = skin === 'fire';
    const isIce    = skin === 'ice';
    const isGold   = skin === 'gold';

    for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        const sx  = seg.x - cx;
        const sy  = seg.y - cy;
        if (sx < -30 || sy < -30 || sx > canvas.width + 30 || sy > canvas.height + 30) continue;

        const ratio = i / segments.length;
        const r     = CELL / 2 * (1 - ratio * 0.3);

        ctx.save();
        ctx.globalAlpha = 1 - ratio * 0.15;

        if (isMe) {
            ctx.shadowColor = color1;
            ctx.shadowBlur  = isNeon ? 18 : isGold ? 14 : 8;
        }

        if (isGalaxy) {
            // Galaxy: kosmik gradient
            const grd = ctx.createRadialGradient(sx - r*0.3, sy - r*0.3, 0, sx, sy, r);
            grd.addColorStop(0, '#ffffff');
            grd.addColorStop(0.3, '#c084fc');
            grd.addColorStop(1, '#4c1d95');
            ctx.fillStyle = grd;
            // Yulduz uchqunlari (tasodifiy)
            if (i % 4 === 0 && isMe) {
                ctx.shadowColor = '#e879f9';
                ctx.shadowBlur  = 20;
            }
        } else if (isMatrix) {
            const grd = ctx.createRadialGradient(sx - r*0.3, sy - r*0.3, 0, sx, sy, r);
            grd.addColorStop(0, '#aaffaa');
            grd.addColorStop(0.5, '#00ff41');
            grd.addColorStop(1, '#003a00');
            ctx.fillStyle = grd;
        } else if (isFire) {
            // Ot: sariqdan qizilga
            const grd = ctx.createRadialGradient(sx - r*0.3, sy - r*0.3, 0, sx, sy, r);
            grd.addColorStop(0, '#ffff00');
            grd.addColorStop(0.4, '#ff6b00');
            grd.addColorStop(1, '#7f0000');
            ctx.fillStyle = grd;
        } else if (isIce) {
            const grd = ctx.createRadialGradient(sx - r*0.3, sy - r*0.3, 0, sx, sy, r);
            grd.addColorStop(0, '#ffffff');
            grd.addColorStop(0.4, '#a5f3fc');
            grd.addColorStop(1, '#075985');
            ctx.fillStyle = grd;
        } else if (isGold) {
            const grd = ctx.createRadialGradient(sx - r*0.3, sy - r*0.3, 0, sx, sy, r);
            grd.addColorStop(0, '#fff8dc');
            grd.addColorStop(0.4, '#ffd700');
            grd.addColorStop(1, '#7a4900');
            ctx.fillStyle = grd;
        } else {
            // Default gradient
            const grd = ctx.createRadialGradient(sx - r*0.3, sy - r*0.3, 0, sx, sy, r);
            grd.addColorStop(0, color1);
            grd.addColorStop(1, color2);
            ctx.fillStyle = grd;
        }

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Ko'zlar (bosh)
    const head = segments[0];
    const hsx  = head.x - cx;
    const hsy  = head.y - cy;

    ctx.save();
    // Ko'z turi: eye_angry, eye_star, eye_heart (market)
    const eyeSkin = getActivEyeSkin();
    drawEyes(hsx, hsy, eyeSkin, isGold);
    ctx.restore();

    // Ism
    if (name) {
        ctx.save();
        // Ism rangi: name_gold, name_red, name_grad (market)
        const nameSkin = isMe ? getActiveNameSkin() : null;
        drawSnakeName(hsx, hsy, name, isMe, nameSkin);
        ctx.restore();
    }
}

// Ko'z chizish
function drawEyes(hsx, hsy, eyeSkin, isGold) {
    if (eyeSkin === 'eye_angry') {
        // 😡 Jahlli ko'zlar
        ctx.fillStyle = '#ff4444';
        ctx.beginPath(); ctx.arc(hsx + 4, hsy - 3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(hsx - 4, hsy - 3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(hsx + 4, hsy - 3, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(hsx - 4, hsy - 3, 1.5, 0, Math.PI * 2); ctx.fill();
        // Qosh
        ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(hsx + 2, hsy - 6); ctx.lineTo(hsx + 7, hsy - 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hsx - 2, hsy - 6); ctx.lineTo(hsx - 7, hsy - 5); ctx.stroke();

    } else if (eyeSkin === 'eye_star') {
        // ⭐ Yulduz ko'zlar
        ctx.fillStyle = '#ffd700';
        drawStar(ctx, hsx + 4, hsy - 3, 5, 3.5, 1.5);
        drawStar(ctx, hsx - 4, hsy - 3, 5, 3.5, 1.5);

    } else if (eyeSkin === 'eye_heart') {
        // ❤️ Yurak ko'zlar
        ctx.fillStyle = '#ff69b4';
        drawHeart(ctx, hsx + 4, hsy - 3, 3);
        drawHeart(ctx, hsx - 4, hsy - 3, 3);

    } else {
        // Default ko'zlar
        ctx.fillStyle = isGold ? '#fffbe6' : '#fff';
        ctx.beginPath(); ctx.arc(hsx + 4, hsy - 3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(hsx - 4, hsy - 3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(hsx + 4, hsy - 3, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(hsx - 4, hsy - 3, 1.5, 0, Math.PI * 2); ctx.fill();
    }
}

// Yurak chizish yordamchi
function drawHeart(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.4);
    ctx.bezierCurveTo(cx, cy - r * 0.2, cx - r, cy - r * 0.8, cx - r, cy - r * 0.3);
    ctx.bezierCurveTo(cx - r, cy + r * 0.2, cx, cy + r * 0.6, cx, cy + r * 0.4);
    ctx.bezierCurveTo(cx, cy + r * 0.6, cx + r, cy + r * 0.2, cx + r, cy - r * 0.3);
    ctx.bezierCurveTo(cx + r, cy - r * 0.8, cx, cy - r * 0.2, cx, cy + r * 0.4);
    ctx.closePath();
    ctx.fill();
}

// Ism chizish
function drawSnakeName(hsx, hsy, name, isMe, nameSkin) {
    ctx.font = 'bold 11px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur  = 4;

    if (nameSkin === 'name_gold') {
        ctx.fillStyle = '#ffd700';
    } else if (nameSkin === 'name_red') {
        ctx.fillStyle = '#ff4444';
    } else if (nameSkin === 'name_grad') {
        // Gradient ism
        const grad = ctx.createLinearGradient(hsx - 30, hsy, hsx + 30, hsy);
        grad.addColorStop(0, '#ff0080');
        grad.addColorStop(0.5, '#ffcc00');
        grad.addColorStop(1, '#00e5ff');
        ctx.fillStyle = grad;
    } else {
        ctx.fillStyle = isMe ? '#00e5ff' : '#ffffff';
    }

    ctx.fillText(name, hsx, hsy - CELL - 4);
}

// Aktiv ko'z skinini olish
function getActivEyeSkin() {
    const now = Date.now();
    for (const eid of ['eye_angry','eye_star','eye_heart']) {
        if (myMarketItems[eid] && myMarketItems[eid].expiresAt > now) return eid;
    }
    return null;
}

// Aktiv ism skinini olish
function getActiveNameSkin() {
    const now = Date.now();
    for (const nid of ['name_gold','name_red','name_grad']) {
        if (myMarketItems[nid] && myMarketItems[nid].expiresAt > now) return nid;
    }
    return null;
}

// =================== MINIMAP ===================
function drawMinimap() {
    const mc    = minimapCtx;
    const mw    = minimapCanvas.width;
    const mh    = minimapCanvas.height;
    const scale = mw / ZONE;

    mc.clearRect(0, 0, mw, mh);

    // Minimap foni (katta minimap perm)
    const mapSize = myMarketItems['badge_star']?.expiresAt > Date.now() ? 1.0 : 0.85;
    mc.fillStyle = 'rgba(6,8,15,' + mapSize + ')';
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
        mc.fillStyle    = myColor[0];
        mc.shadowColor  = myColor[0];
        mc.shadowBlur   = 4;
        mc.beginPath();
        mc.arc(mySnake.segments[0].x * scale, mySnake.segments[0].y * scale, 3.5, 0, Math.PI * 2);
        mc.fill();
        mc.shadowBlur = 0;
    }
    mc.strokeStyle = 'rgba(0,229,255,0.4)';
    mc.lineWidth   = 1;
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
    function onStart(e) { e.preventDefault(); joystickActive = true; }
    function onMove(e) {
        if (!joystickActive) return;
        e.preventDefault();
        const touch  = e.touches ? e.touches[0] : e;
        const center = getCenter();
        const dx     = touch.clientX - center.x;
        const dy     = touch.clientY - center.y;
        const dist   = Math.sqrt(dx * dx + dy * dy);
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
    if      (a > -Math.PI / 4    && a <= Math.PI / 4)    dir = 'right';
    else if (a > Math.PI / 4     && a <= 3*Math.PI / 4)  dir = 'down';
    else if (a > 3*Math.PI / 4   || a <= -3*Math.PI / 4) dir = 'left';
    else                                                   dir = 'up';
    if (dir && dir !== opp[mySnake.dir]) mySnake.nextDir = dir;
}

// =================== BOOST ===================
function setupBoost() {
    const btn = document.getElementById('boost-btn');
    if (!btn) return;
    btn.addEventListener('touchstart', e => {
        e.preventDefault();
        boostActive = true;
        btn.style.transform = 'scale(.93)';
    }, { passive: false });
    btn.addEventListener('touchend', () => {
        boostActive = false;
        btn.style.transform = '';
    });
    btn.addEventListener('mousedown', () => { boostActive = true; });
    document.addEventListener('mouseup', () => { boostActive = false; });
}

// =================== KLAVIATURA ===================
function setupKeyboard() {
    const keyMap = {
        ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
        w:'up', s:'down', a:'left', d:'right',
        W:'up', S:'down', A:'left', D:'right'
    };
    const opp = { right:'left', left:'right', up:'down', down:'up' };
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
    const b  = document.getElementById('hud-balance');
    const s  = document.getElementById('hud-score');
    const p  = document.getElementById('hud-players');
    if (b) b.textContent = myBalance.toFixed(5);
    if (s && mySnake) s.textContent = mySnake.score;
    if (p) p.textContent = Object.keys(allSnakes).length || 1;
}

// =================== QIDIRUV UI ===================
function showSearchState(name) {
    stateIdle.classList.add('hidden');
    stateSearching.classList.add('hidden');
    stateFound.classList.add('hidden');
    stateNew.classList.add('hidden');
    const map = { idle:stateIdle, searching:stateSearching, found:stateFound, new:stateNew };
    if (map[name]) map[name].classList.remove('hidden');
}

function setStep(num, state) {
    const stepEl   = document.getElementById('step-' + num);
    const statusEl = document.getElementById('status-' + num);
    if (!stepEl) return;
    stepEl.classList.remove('active', 'done');
    if (state === 'active') { stepEl.classList.add('active');  if (statusEl) statusEl.textContent = '⏳'; }
    if (state === 'done')   { stepEl.classList.add('done');    if (statusEl) statusEl.textContent = '✅'; }
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
function delay(ms)      { return new Promise(res => setTimeout(res, ms)); }
function snapGrid(v)    { return Math.round(v / CELL) * CELL; }
function rand(min, max) { return Math.floor(Math.random() * (max - min)) + min; }
