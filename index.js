// index.js (التحكم المركزي عبر لوحة التحكم)
const mineflayer = require('mineflayer');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ... (تضمين جميع دوال الحركة والقتال مثل equipBestWeapon, randomAFKLoop, stuckDetection, إلخ)
// ... (القائمة الطويلة للرسائل والأسماء تبقى كما هي)
// ... (Constants مثل BOT_COUNT, SERVER_HOST, SERVER_PORT)

const activeBots = {}; // قائمة البوتات النشطة

// متغيرات الإعدادات التي سيتم التحكم بها من لوحة التحكم
let globalSettings = {
    host: 'Play-game.aternos.me', 
    port: 54480, 
    version: '1.19.4', // الإصدار الافتراضي (يمكنك تغييره من الواجهة)
    botCount: 100 
};

// =========================================================
// وظيفة إنشاء البوتات الآن تأخذ الإعدادات من 'globalSettings'
// =========================================================
function createBot(username) {
    // ... (نفس منطق createBot ولكن يستخدم globalSettings.host, globalSettings.port, globalSettings.version)
}


// =========================================================
// منطقة تحكم لوحة الويب (Express.js)
// =========================================================

// لخدمة ملفات HTML الثابتة (يجب أن تنشئ ملف اسمه index.html)
app.use(express.static('public')); 
app.use(express.json());

io.on('connection', (socket) => {
    console.log('Control panel connected.');
    
    // إرسال الإعدادات الحالية عند الاتصال
    socket.emit('currentSettings', globalSettings);

    // استقبال أمر "بدء" أو "تحديث" من لوحة التحكم
    socket.on('startBots', (newSettings) => {
        // تحديث الإعدادات العامة بالإعدادات الجديدة المرسلة من الويب
        globalSettings = { ...globalSettings, ...newSettings };
        
        // إيقاف البوتات القديمة أولاً
        Object.keys(activeBots).forEach(username => {
            const bot = activeBots[username].botInstance;
            if (bot) bot.end('Received new settings from control panel.');
        });
        
        // بدء البوتات الجديدة بالإعدادات الجديدة
        for (let i = 1; i <= globalSettings.botCount; i++) {
            createBot(`Anonymous${i}`);
        }
        console.log(`Starting ${globalSettings.botCount} bots on version ${globalSettings.version}`);
    });
    
    // يمكنك هنا إضافة وظائف أخرى مثل 'stopAllBots' أو 'sendGlobalChat'
});

// بدء خادم الويب
const WEB_PORT = 3000;
server.listen(WEB_PORT, () => {
    console.log(`🌐 Control Panel running on http://localhost:${WEB_PORT}`);
});
