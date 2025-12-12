// index.js (النسخة النهائية - التحركات البشرية والتبديل والقتال)
const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3'); 

// === إعدادات البوتات والاتصال ===
const BOT_USERNAMES = [
    'Player_Alpha', 'Agent_Beta', 'Unit_Gama', 'Spectr_Delta', 'Echo_Bot', 
    'Nexus_One', 'Raid_Zero', 'Morpheus_X', 'Sky_Walker', 'Ghost_Rider'
]; 

const SERVER_HOST = 'skydata.aternos.me';
const SERVER_PORT = 28068;
const SERVER_VERSION = '1.19.4'; 
const SWITCH_DELAY = 30000; // 30 ثانية انتظار قبل محاولة البوت التالي
const COMBAT_RANGE = 15; // نطاق الهجوم
const STUCK_THRESHOLD_SECONDS = 30; // **>> مهلة التعليق الجديدة <<**

let currentBotIndex = 0; 
let currentBot = null; 
let afkLoopTimeout = null; 
let stuckCheckInterval = null; 
let lastPosition = null; 

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
    if (!bot || !bot.entity) return;
    
    for (const control of movementControls) {
        bot.setControlState(control, false);
    }
    
    if (bot.nearestEntity(entity => entity.type === 'mob' && bot.entity.position.distanceTo(entity.position) <= COMBAT_RANGE)) {
        clearTimeout(afkLoopTimeout); 
        return; 
    }

    const randomControl = movementControls[Math.floor(Math.random() * movementControls.length)];
    let movementDuration = Math.random() * 5000 + 1000; 

    console.log(`AFK: Moving ${randomControl} for ${Math.round(movementDuration / 1000)}s. Sprinting/Jumping.`);
    
    bot.setControlState(randomControl, true);
    bot.setControlState('sprint', true);
    if (Math.random() > 0.5) bot.setControlState('jump', true);

    if (Math.random() < 0.2) {
        movementDuration = 1000; 
        bot.look(bot.entity.yaw + Math.PI * 2, bot.entity.pitch, true);
        console.log("AFK: Performing 360-degree spin.");
    }
    
    afkLoopTimeout = setTimeout(() => {
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
    if (!bot || !bot.entity) return;
    
    const filter = entity => (
        entity.type === 'mob' && 
        bot.entity.position.distanceTo(entity.position) <= COMBAT_RANGE 
    );

    const target = bot.nearestEntity(filter);

    if (target) {
        await equipBestWeapon(bot);

        for (const control of movementControls) {
            bot.setControlState(control, false);
        }
        clearTimeout(afkLoopTimeout);
        
        console.log(`⚔️ COMBAT PRIORITY: Engaging ${target.name} (Distance: ${bot.entity.position.distanceTo(target.position).toFixed(1)} blocks).`);
        
        bot.lookAt(target.position.offset(0, target.height, 0), true, () => {
             bot.attack(target, true); 
             
             if (bot.entity.position.distanceTo(target.position) > 3) {
                 bot.setControlState('forward', true);
             } else {
                 bot.setControlState('forward', false);
             }
        });
        
    } else if (!afkLoopTimeout) {
         randomAFKLoop(bot);
    }
}

// 5. دالة التحقق من التعليق والعودة إلى نقطة البداية (مُحدثة)
function stuckDetection(bot) {
    if (!bot || !bot.entity || !lastPosition) return;

    // 1. التحقق مما إذا كان البوت يحاول التحرك حالياً
    const isMoving = movementControls.some(control => bot.getControlState(control));

    // 2. التحقق من التعليق: يحاول التحرك ولكن لم يتغير موقعه
    if (isMoving && bot.entity.position.distanceTo(lastPosition) < 0.1) {
        
        if (stuckCheckInterval === null) {
            // بدأ التعليق، نبدأ المؤقت لـ 30 ثانية
            console.log(`[Stuck Check] Started ${STUCK_THRESHOLD_SECONDS}s timer.`);
            stuckCheckInterval = setTimeout(() => {
                
                // بعد انتهاء 30 ثانية، نتحقق مرة أخيرة
                if (bot.entity.position.distanceTo(lastPosition) < 0.1) {
                    console.log(`⚠️ STUCK DETECTED! No movement for ${STUCK_THRESHOLD_SECONDS}s. Teleporting to spawn.`);
                    
                    for (const control of movementControls) {
                        bot.setControlState(control, false);
                    }
                    bot.chat('/spawn'); // أمر الاستعادة
                } else {
                    console.log("[Stuck Check] Timer expired, but bot moved just in time.");
                }

                // مسح المؤقت سواء نجح أو فشل
                stuckCheckInterval = null; 
            }, STUCK_THRESHOLD_SECONDS * 1000); 

        }
    } else {
        // إذا تحرك البوت أو لم يكن يحاول التحرك، أعد ضبط المؤقت (إذا كان قيد التشغيل)
        if (stuckCheckInterval) {
            console.log("[Stuck Check] Movement detected, resetting timer.");
            clearTimeout(stuckCheckInterval);
            stuckCheckInterval = null;
        }
    }
    // 3. تحديث آخر موضع
    lastPosition = bot.entity.position.clone();
}


// --- دوال الاتصال والتبديل ---

function createBot() {
    const username = BOT_USERNAMES[currentBotIndex];
    console.log(`--- Attempting to connect Bot #${currentBotIndex + 1}: ${username} ---`);

    const bot = mineflayer.createBot({
        host: SERVER_HOST,
        port: SERVER_PORT,
        username: username,
        version: SERVER_VERSION,
        auth: 'offline', 
        hideErrors: true 
    });

    currentBot = bot; 

    bot.on('login', () => {
        console.log(`✅ Bot logged in as ${bot.username}`);
    });

    bot.on('spawn', () => {
        console.log('✅ Bot spawned. Starting Advanced Routines.');
        
        lastPosition = bot.entity.position.clone();

        // 1. بدء روتين الحركة العشوائية (AFK)
        randomAFKLoop(bot);
        
        // 2. بدء روتين البحث عن الوحوش والهجوم (يفحص كل 500ms للهجوم الفوري)
        setInterval(() => lookForMobsAndAttack(bot), 500); 

        // 3. بدء روتين حركة الرأس (يفحص كل 500ms)
        setInterval(() => randomHeadLook(bot), 500);
        
        // 4. فحص التعليق (يفحص كل 5 ثوانٍ، والدالة الداخلية هي من يبدأ مؤقت الـ 30 ثانية)
        setInterval(() => stuckDetection(bot), 5000); 
    });
    
    // --- معالجة أخطاء إعادة الاتصال والتبديل ---
    
    const switchBot = (reason) => {
        if (currentBot) {
            clearTimeout(afkLoopTimeout); 
            if (stuckCheckInterval) clearTimeout(stuckCheckInterval); // مسح مؤقت التعليق
            currentBot.end(); 
            currentBot = null;
        }
        
        currentBotIndex = (currentBotIndex + 1) % BOT_USERNAMES.length; 
        
        console.log(`🚨 Disconnected Reason: ${reason}. Switching to next bot in ${SWITCH_DELAY / 1000}s.`);
        console.log(`---> Next Bot Index: #${currentBotIndex + 1} (${BOT_USERNAMES[currentBotIndex]}) <---`);

        setTimeout(createBot, SWITCH_DELAY);
    };

    bot.on('kicked', (reason) => {
        const kickMessage = (typeof reason === 'object' && reason.translate) ? reason.translate : String(reason);
        switchBot(`Kicked! Reason: ${kickMessage}`);
    });

    bot.on('end', (reason) => {
        switchBot(`Bot disconnected. Reason: ${reason}`);
    });

    bot.on('error', (err) => {
        console.log(`🛑 Bot Error: ${err.message}`);
    });

    return bot;
}

// بدء العملية بالبوت الأول
createBot();
