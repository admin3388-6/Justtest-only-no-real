// index.js (النسخة النهائية - 100 بوت متزامن، تحركات، قتال، ودردشة كل 4 ثواني)
const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3'); 

// === 1. إعدادات الخادم والاتصال (مُعدلة) ===
const SERVER_HOST = 'beginning-margaret.gl.joinmc.link'; // IP الجديد
const SERVER_PORT = 4752; // البورت الجديد
const SERVER_VERSION = '1.19.4'; 
const COMBAT_RANGE = 15; // نطاق الهجوم
const STUCK_THRESHOLD_SECONDS = 30; // مهلة التعليق
const BOT_COUNT = 100; // العدد المطلوب من البوتات
const CHAT_INTERVAL_MS = 4000; // **>> فاصل الدردشة الجديد: 4 ثواني <<**

// === 2. توليد أسماء المستخدمين والرسائل العشوائية ===
const BOT_USERNAMES = [];
for (let i = 1; i <= BOT_COUNT; i++) {
    BOT_USERNAMES.push(`Anonymous${i}`);
}

// قائمة الرسائل العشوائية المقبولة
const RANDOM_MESSAGES = [
    "Anonymous group Log in", 
    "Counter initiated", 
    "It was identified", 
    "Work in progress", 
    "Loading new parameters", 
    "hacking neighbor",
    "System online",
    "Checking server status",
    "Starting sequence 01",
    "Bot detected"
];

const activeBots = {}; // كائن لتخزين البوتات النشطة، والمؤقتات الخاصة بها
const movementControls = ['forward', 'back', 'left', 'right', 'jump', 'sprint'];

// --- دوال التحسينات البشرية والقتال ---

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

// دالة التحقق من التعليق والعودة إلى نقطة البداية
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

// دالة إرسال رسالة عشوائية
function sendRandomChat(bot) {
    if (!bot || !bot.entity) return;

    // اختيار رسالة عشوائية من القائمة
    const randomMessage = RANDOM_MESSAGES[Math.floor(Math.random() * RANDOM_MESSAGES.length)];

    // إضافة اسم البوت إلى الرسالة
    const fullMessage = `[${bot.username}]: ${randomMessage}`; 
    
    // إرسال الرسالة
    bot.chat(fullMessage);
    console.log(`[${bot.username}] 💬 Sent Chat: ${fullMessage}`);
}

// --- دوال الاتصال والتشغيل الجماعي ---

function startBotRoutines(bot) {
    console.log(`[${bot.username}] ✅ Bot spawned. Starting Advanced Routines.`);
    
    // 1. إعداد بيانات البوت
    activeBots[bot.username].lastPosition = bot.entity.position.clone();

    // 2. بدء روتين الحركة العشوائية (AFK)
    randomAFKLoop(bot);
    
    // 3. بدء روتين البحث عن الوحوش والهجوم
    activeBots[bot.username].combatInterval = setInterval(() => lookForMobsAndAttack(bot), 500); 

    // 4. بدء روتين حركة الرأس
    activeBots[bot.username].headLookInterval = setInterval(() => randomHeadLook(bot), 500);
    
    // 5. فحص التعليق
    activeBots[bot.username].stuckCheckInterval = setInterval(() => stuckDetection(bot), 5000); 
    
    // 6. بدء روتين الدردشة العشوائية (كل 4 ثواني)
    sendRandomChat(bot);
    activeBots[bot.username].chatInterval = setInterval(() => sendRandomChat(bot), CHAT_INTERVAL_MS);
}

function cleanupBot(username) {
    const botData = activeBots[username];
    if (botData) {
        clearTimeout(botData.afkLoopTimeout);
        clearTimeout(botData.stuckCheckTimeout);
        clearInterval(botData.combatInterval);
        clearInterval(botData.headLookInterval);
        clearInterval(botData.stuckCheckInterval);
        clearInterval(botData.chatInterval); 
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
        chatInterval: null, 
        lastPosition: null,
    };

    bot.on('login', () => {
        console.log(`[${bot.username}] ✅ Logged in.`);
    });

    bot.on('spawn', () => {
        startBotRoutines(bot);
    });

    const reconnectBot = (reason) => {
        console.log(`[${username}] 🚨 Disconnected Reason: ${reason}. Attempting to reconnect.`);
        cleanupBot(username); 
        setTimeout(() => createBot(username), 5000); 
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
