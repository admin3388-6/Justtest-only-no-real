// index.js (النسخة المُعدلة - 100 بوت متزامن)
const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3'); 

// === 1. إعدادات الخادم والاتصال (مُعدلة) ===
const SERVER_HOST = 'joinmc.link'; // IP الجديد
const SERVER_PORT = 4752; // البورت الجديد
const SERVER_VERSION = '1.19.4'; 
const COMBAT_RANGE = 15; // نطاق الهجوم
const STUCK_THRESHOLD_SECONDS = 30; // مهلة التعليق
const BOT_COUNT = 100; // العدد المطلوب من البوتات

// === 2. توليد أسماء المستخدمين (مُعدلة) ===
const BOT_USERNAMES = [];
for (let i = 1; i <= BOT_COUNT; i++) {
    BOT_USERNAMES.push(`Anonymous${i}`);
}

const activeBots = {}; // كائن لتخزين البوتات النشطة، والمؤقتات الخاصة بها
const movementControls = ['forward', 'back', 'left', 'right', 'jump', 'sprint'];

// --- دوال التحسينات البشرية والقتال (مُعدلة لتقبل كائن البوت) ---

async function equipBestWeapon(bot) {
    const sword = bot.inventory.items().find(item => item.name.includes('sword'));
    if (sword) {
        await bot.equip(sword, 'hand').catch(() => {});
        return true;
    }
    return false;
}

function randomAFKLoop(bot) {
    if (!bot || !bot.entity || !activeBots[bot.username]) return;

    // مسح الحركة السابقة
    for (const control of movementControls) {
        bot.setControlState(control, false);
    }
    
    // إذا كان هناك قتال، لا تبدأ حلقة AFK
    if (bot.nearestEntity(entity => entity.type === 'mob' && bot.entity.position.distanceTo(entity.position) <= COMBAT_RANGE)) {
        clearTimeout(activeBots[bot.username].afkLoopTimeout); 
        return; 
    }

    const randomControl = movementControls[Math.floor(Math.random() * movementControls.length)];
    let movementDuration = Math.random() * 5000 + 1000; 

    console.log(`[${bot.username}] AFK: Moving ${randomControl} for ${Math.round(movementDuration / 1000)}s. Sprinting/Jumping.`);
    
    bot.setControlState(randomControl, true);
    bot.setControlState('sprint', true);
    if (Math.random() > 0.5) bot.setControlState('jump', true);

    if (Math.random() < 0.2) {
        movementDuration = 1000; 
        bot.look(bot.entity.yaw + Math.PI * 2, bot.entity.pitch, true);
        console.log(`[${bot.username}] AFK: Performing 360-degree spin.`);
    }
    
    // تخزين مؤقت AFK في الكائن الخاص بالبوت
    activeBots[bot.username].afkLoopTimeout = setTimeout(() => {
        for (const control of movementControls) {
            bot.setControlState(control, false);
        }
        randomAFKLoop(bot); 
    }, movementDuration);
}

function randomHeadLook(bot) {
    if (!bot || !bot.entity) return;

    const yaw = bot.entity.yaw + (Math.random() * 0.5 - 0.25); 
    const pitch = bot.entity.pitch + (Math.random() * 0.5 - 0.25); 
    
    bot.look(yaw, pitch, true).catch(() => {}); 
}

async function lookForMobsAndAttack(bot) {
    if (!bot || !bot.entity || !activeBots[bot.username]) return;
    
    const filter = entity => (
        entity.type === 'mob' && 
        bot.entity.position.distanceTo(entity.position) <= COMBAT_RANGE 
    );

    const target = bot.nearestEntity(filter);

    if (target) {
        await equipBestWeapon(bot);

        // إيقاف حركة AFK
        for (const control of movementControls) {
            bot.setControlState(control, false);
        }
        clearTimeout(activeBots[bot.username].afkLoopTimeout);
        
        console.log(`[${bot.username}] ⚔️ COMBAT PRIORITY: Engaging ${target.name} (Distance: ${bot.entity.position.distanceTo(target.position).toFixed(1)} blocks).`);
        
        bot.lookAt(target.position.offset(0, target.height, 0), true, () => {
             bot.attack(target, true); 
             
             if (bot.entity.position.distanceTo(target.position) > 3) {
                 bot.setControlState('forward', true);
             } else {
                 bot.setControlState('forward', false);
             }
        });
        
    } else if (!activeBots[bot.username].afkLoopTimeout) {
         randomAFKLoop(bot);
    }
}

// دالة التحقق من التعليق والعودة إلى نقطة البداية (مُحدثة لتقبل كائن البوت)
function stuckDetection(bot) {
    if (!bot || !bot.entity || !activeBots[bot.username] || !activeBots[bot.username].lastPosition) return;
    
    const botData = activeBots[bot.username];

    // 1. التحقق مما إذا كان البوت يحاول التحرك حالياً
    const isMoving = movementControls.some(control => bot.getControlState(control));

    // 2. التحقق من التعليق: يحاول التحرك ولكن لم يتغير موقعه
    if (isMoving && bot.entity.position.distanceTo(botData.lastPosition) < 0.1) {
        
        if (botData.stuckCheckTimeout === null) {
            // بدأ التعليق، نبدأ المؤقت لـ 30 ثانية
            console.log(`[${bot.username}] [Stuck Check] Started ${STUCK_THRESHOLD_SECONDS}s timer.`);
            botData.stuckCheckTimeout = setTimeout(() => {
                
                // بعد انتهاء 30 ثانية، نتحقق مرة أخيرة
                if (bot.entity.position.distanceTo(botData.lastPosition) < 0.1) {
                    console.log(`[${bot.username}] ⚠️ STUCK DETECTED! No movement for ${STUCK_THRESHOLD_SECONDS}s. Teleporting to spawn.`);
                    
                    for (const control of movementControls) {
                        bot.setControlState(control, false);
                    }
                    bot.chat('/spawn'); // أمر الاستعادة
                } else {
                    console.log(`[${bot.username}] [Stuck Check] Timer expired, but bot moved just in time.`);
                }
                botData.stuckCheckTimeout = null; 
            }, STUCK_THRESHOLD_SECONDS * 1000); 

        }
    } else {
        // إذا تحرك البوت أو لم يكن يحاول التحرك، أعد ضبط المؤقت (إذا كان قيد التشغيل)
        if (botData.stuckCheckTimeout) {
            console.log(`[${bot.username}] [Stuck Check] Movement detected, resetting timer.`);
            clearTimeout(botData.stuckCheckTimeout);
            botData.stuckCheckTimeout = null;
        }
    }
    // 3. تحديث آخر موضع
    botData.lastPosition = bot.entity.position.clone();
}


// --- دوال الاتصال والتشغيل الجماعي (مُعدلة بالكامل) ---

function startBotRoutines(bot) {
    console.log(`[${bot.username}] ✅ Bot spawned. Starting Advanced Routines.`);
    
    // 1. إعداد بيانات البوت
    activeBots[bot.username].lastPosition = bot.entity.position.clone();

    // 2. بدء روتين الحركة العشوائية (AFK)
    randomAFKLoop(bot);
    
    // 3. بدء روتين البحث عن الوحوش والهجوم (يفحص كل 500ms)
    activeBots[bot.username].combatInterval = setInterval(() => lookForMobsAndAttack(bot), 500); 

    // 4. بدء روتين حركة الرأس (يفحص كل 500ms)
    activeBots[bot.username].headLookInterval = setInterval(() => randomHeadLook(bot), 500);
    
    // 5. فحص التعليق (يفحص كل 5 ثوانٍ)
    activeBots[bot.username].stuckCheckInterval = setInterval(() => stuckDetection(bot), 5000); 
}

function cleanupBot(username) {
    const botData = activeBots[username];
    if (botData) {
        clearTimeout(botData.afkLoopTimeout);
        clearTimeout(botData.stuckCheckTimeout);
        clearInterval(botData.combatInterval);
        clearInterval(botData.headLookInterval);
        clearInterval(botData.stuckCheckInterval);
        delete activeBots[username];
        console.log(`[${username}] Cleaned up and removed from active list.`);
    }
}

function createBot(username) {
    console.log(`--- Attempting to connect Bot: ${username} ---`);

    const bot = mineflayer.createBot({
        host: SERVER_HOST,
        port: SERVER_PORT,
        username: username,
        version: SERVER_VERSION,
        auth: 'offline', 
        hideErrors: true 
    });

    // تهيئة كائن البيانات الخاص بهذا البوت
    activeBots[username] = {
        botInstance: bot,
        afkLoopTimeout: null,
        stuckCheckTimeout: null,
        combatInterval: null,
        headLookInterval: null,
        stuckCheckInterval: null,
        lastPosition: null,
    };

    bot.on('login', () => {
        console.log(`[${bot.username}] ✅ Logged in.`);
    });

    bot.on('spawn', () => {
        startBotRoutines(bot);
    });
    
    // --- معالجة أخطاء إعادة الاتصال (سيتم إعادة تشغيله بعد الفصل) ---
    
    const reconnectBot = (reason) => {
        console.log(`[${username}] 🚨 Disconnected Reason: ${reason}. Attempting to reconnect.`);
        cleanupBot(username); // مسح المؤقتات وإزالة البوت القديم
        setTimeout(() => createBot(username), 5000); // إعادة محاولة الاتصال بعد 5 ثوانٍ
    };

    bot.on('kicked', (reason) => {
        const kickMessage = (typeof reason === 'object' && reason.translate) ? reason.translate : String(reason);
        reconnectBot(`Kicked! Reason: ${kickMessage}`);
    });

    bot.on('end', (reason) => {
        reconnectBot(`Bot disconnected. Reason: ${reason}`);
    });

    bot.on('error', (err) => {
        console.log(`[${username}] 🛑 Bot Error: ${err.message}`);
        reconnectBot(`Error: ${err.message}`);
    });
}

// بدء العملية: تشغيل كل البوتات الـ 100 في وقت واحد
BOT_USERNAMES.forEach(username => {
    createBot(username);
});
