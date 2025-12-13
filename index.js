// index.js (خادم التحكم المركزي ولوحة الويب)
const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3'); 
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// =========================================================
// 1. إعداد خادم الويب (Express/Socket.IO)
// =========================================================

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// لخدمة ملفات لوحة التحكم (يجب أن تنشئ مجلد public به ملف index.html)
app.use(express.static('public')); 

// =========================================================
// 2. الثوابت والمتغيرات العامة
// =========================================================

const COMBAT_RANGE = 15; 
const STUCK_THRESHOLD_SECONDS = 30; 
const CHAT_INTERVAL_MS = 4000; // 4 ثواني

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

// الإعدادات الافتراضية الأولية (يمكن تغييرها من لوحة التحكم)
let globalSettings = {
    host: 'beginning-margaret.gl.joinmc.link', 
    port: 4752, 
    version: '1.19.4', 
    botCount: 100 
};

const activeBots = {}; // كائن لتخزين البوتات النشطة والمؤقتات
const movementControls = ['forward', 'back', 'left', 'right', 'jump', 'sprint'];

// =========================================================
// 3. دوال Mineflayer (القتال والحركة والدردشة)
// =========================================================

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
    for (const control of movementControls) {
        bot.setControlState(control, false);
    }
    if (bot.nearestEntity(entity => entity.type === 'mob' && bot.entity.position.distanceTo(entity.position) <= COMBAT_RANGE)) {
        clearTimeout(activeBots[bot.username].afkLoopTimeout); 
        return; 
    }

    const randomControl = movementControls[Math.floor(Math.random() * movementControls.length)];
    let movementDuration = Math.random() * 5000 + 1000; 

    console.log(`[${bot.username}] AFK: Moving ${randomControl} for ${Math.round(movementDuration / 1000)}s.`);
    
    bot.setControlState(randomControl, true);
    bot.setControlState('sprint', true);
    if (Math.random() > 0.5) bot.setControlState('jump', true);

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
    const target = bot.nearestEntity(entity => (
        entity.type === 'mob' && 
        bot.entity.position.distanceTo(entity.position) <= COMBAT_RANGE 
    ));

    if (target) {
        await equipBestWeapon(bot);
        for (const control of movementControls) {
            bot.setControlState(control, false);
        }
        clearTimeout(activeBots[bot.username].afkLoopTimeout);
        
        console.log(`[${bot.username}] ⚔️ COMBAT PRIORITY: Engaging ${target.name}.`);
        
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

function stuckDetection(bot) {
    if (!bot || !bot.entity || !activeBots[bot.username] || !activeBots[bot.username].lastPosition) return;
    
    const botData = activeBots[bot.username];
    const isMoving = movementControls.some(control => bot.getControlState(control));

    if (isMoving && bot.entity.position.distanceTo(botData.lastPosition) < 0.1) {
        if (botData.stuckCheckTimeout === null) {
            botData.stuckCheckTimeout = setTimeout(() => {
                if (bot.entity.position.distanceTo(botData.lastPosition) < 0.1) {
                    console.log(`[${bot.username}] ⚠️ STUCK DETECTED! Teleporting to spawn.`);
                    for (const control of movementControls) {
                        bot.setControlState(control, false);
                    }
                    bot.chat('/spawn'); 
                }
                botData.stuckCheckTimeout = null; 
            }, STUCK_THRESHOLD_SECONDS * 1000); 

        }
    } else {
        if (botData.stuckCheckTimeout) {
            clearTimeout(botData.stuckCheckTimeout);
            botData.stuckCheckTimeout = null;
        }
    }
    botData.lastPosition = bot.entity.position.clone();
}

function sendRandomChat(bot) {
    if (!bot || !bot.entity) return;
    const randomMessage = RANDOM_MESSAGES[Math.floor(Math.random() * RANDOM_MESSAGES.length)];
    const fullMessage = `[${bot.username}]: ${randomMessage}`; 
    bot.chat(fullMessage);
    io.emit('botChat', { username: bot.username, message: fullMessage }); // إرسال الرسالة إلى لوحة التحكم
}

// =========================================================
// 4. دوال دورة حياة البوت (Bot Lifecycle)
// =========================================================

function startBotRoutines(bot) {
    console.log(`[${bot.username}] ✅ Bot spawned. Starting Routines.`);
    io.emit('botStatus', { username: bot.username, status: 'Active' });
    
    activeBots[bot.username].lastPosition = bot.entity.position.clone();

    randomAFKLoop(bot);
    activeBots[bot.username].combatInterval = setInterval(() => lookForMobsAndAttack(bot), 500); 
    activeBots[bot.username].headLookInterval = setInterval(() => randomHeadLook(bot), 500);
    activeBots[bot.username].stuckCheckInterval = setInterval(() => stuckDetection(bot), 5000); 
    
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

function createBot(index) {
    const username = `Anonymous${index + 1}`;
    console.log(`--- Attempting to connect Bot: ${username} ---`);

    const bot = mineflayer.createBot({
        host: globalSettings.host,
        port: globalSettings.port,
        username: username,
        version: globalSettings.version,
        auth: 'offline', 
        hideErrors: true 
    });

    activeBots[username] = {
        botInstance: bot,
        afkLoopTimeout: null,
        stuckCheckTimeout: null,
        combatInterval: null,
        headLookInterval: null,
        stuckCheckInterval: null,
        chatInterval: null, 
        lastPosition: null,
        index: index
    };
    
    io.emit('botStatus', { username: username, status: 'Connecting' });

    bot.on('login', () => {
        console.log(`[${bot.username}] ✅ Logged in.`);
    });

    bot.on('spawn', () => {
        startBotRoutines(bot);
    });

    const reconnectBot = (reason) => {
        console.log(`[${username}] 🚨 Disconnected Reason: ${reason}. Attempting to reconnect.`);
        io.emit('botStatus', { username: username, status: `Reconnecting: ${reason.substring(0, 20)}...` });
        cleanupBot(username); 
        setTimeout(() => createBot(index), 5000); 
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

// =========================================================
// 5. منطقة تحكم لوحة الويب (Socket.IO Handlers)
// =========================================================

io.on('connection', (socket) => {
    console.log('Control panel connected.');
    
    // إرسال الإعدادات الحالية عند الاتصال
    socket.emit('currentSettings', globalSettings);

    // استقبال أمر "بدء" أو "تحديث" من لوحة التحكم
    socket.on('startBots', (newSettings) => {
        globalSettings = { ...globalSettings, ...newSettings };
        
        console.log('--- Received START command ---');
        console.log(`New Settings: Host=${globalSettings.host}, Version=${globalSettings.version}, Count=${globalSettings.botCount}`);
        
        // إيقاف جميع البوتات القديمة أولاً
        Object.keys(activeBots).forEach(username => {
            const bot = activeBots[username].botInstance;
            if (bot) bot.end('Received new settings.');
            cleanupBot(username);
        });
        
        // بدء البوتات الجديدة بالإعدادات الجديدة
        for (let i = 0; i < globalSettings.botCount; i++) {
            createBot(i);
        }
    });
});


// =========================================================
// 6. تشغيل خادم الويب (مع معالجة مشكلة المنفذ على Railway)
// =========================================================

// استخدام المنفذ الذي يحدده الخادم (process.env.PORT) أو استخدام 3000 كافتراضي محلي
const PORT = process.env.PORT || 3000; 

server.listen(PORT, () => {
    console.log('===================================================');
    console.log(`🌐 Control Panel ready! Access it via port ${PORT}`);
    console.log('===================================================');
});
