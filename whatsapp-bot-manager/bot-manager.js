const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

class BotManager {
    constructor(db) {
        this.db = db;
        this.bots = new Map(); // projectId -> { client, status, info }
        this.qrCallbacks = new Map(); // projectId -> callback function
    }

    // Start a bot for a project
    async startBot(project, onStatusChange) {
        const { id, name, bot_phone } = project;

        // Check if bot already running
        if (this.bots.has(id)) {
            console.log(`[${id}] Bot already running`);
            return { success: false, error: 'Bot already running' };
        }

        console.log(`\n🚀 Starting bot for project: ${name} (${id})`);

        // Create session path
        const sessionPath = path.join(__dirname, 'sessions', id);
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        // Create WhatsApp client with non-headless mode
        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: id,
                dataPath: sessionPath
            }),
            authTimeoutMs: 90000,
            qrMaxRetries: 5,
            puppeteer: {
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            }
        });

        // Store callback
        if (onStatusChange) {
            this.qrCallbacks.set(id, onStatusChange);
        }

        // QR Code event
        client.on('qr', (qr) => {
            console.log(`\n📱 [${name}] QR CODE RECEIVED!`);
            console.log('📱 Scan this QR code with WhatsApp Business app');
            console.log('📱 Settings → Linked Devices → Link a Device\n');
            
            qrcode.generate(qr, { small: true });
            
            if (onStatusChange) {
                onStatusChange('qr', { qr, projectId: id, projectName: name });
            }

            // Log to database
            this.db.run('INSERT INTO logs (project_id, action, details) VALUES (?, ?, ?)',
                [id, 'QR_GENERATED', JSON.stringify({ timestamp: new Date().toISOString() })]);
        });

        // Loading screen
        client.on('loading_screen', (percent, message) => {
            console.log(`📱 [${name}] Loading: ${percent}% - ${message}`);
        });

        // Ready event
        client.on('ready', () => {
            console.log(`\n✅ [${name}] Bot is READY and connected!`);
            console.log(`✅ [${name}] Phone: ${client.info?.wid?.user || 'Unknown'}\n`);
            
            const botData = this.bots.get(id);
            if (botData) {
                botData.status = 'active';
                botData.info = client.info;
            }

            if (onStatusChange) {
                onStatusChange('ready', { projectId: id, projectName: name, info: client.info });
            }

            // Update database
            this.db.run('UPDATE projects SET status = ?, bot_phone = ? WHERE id = ?',
                ['active', client.info?.wid?.user, id]);

            // Log
            this.db.run('INSERT INTO logs (project_id, action, details) VALUES (?, ?, ?)',
                [id, 'BOT_READY', JSON.stringify({ phone: client.info?.wid?.user })]);
        });

        // Disconnected
        client.on('disconnected', (reason) => {
            console.log(`❌ [${name}] Disconnected: ${reason}`);
            
            const botData = this.bots.get(id);
            if (botData) {
                botData.status = 'disconnected';
            }

            if (onStatusChange) {
                onStatusChange('disconnected', { projectId: id, projectName: name, reason });
            }

            // Update database
            this.db.run('UPDATE projects SET status = ? WHERE id = ?', ['inactive', id]);

            // Log
            this.db.run('INSERT INTO logs (project_id, action, details) VALUES (?, ?, ?)',
                [id, 'BOT_DISCONNECTED', JSON.stringify({ reason })]);

            // Remove from active bots
            this.bots.delete(id);
        });

        // Auth failure
        client.on('auth_failure', (msg) => {
            console.log(`❌ [${name}] Auth failure: ${msg}`);
            
            if (onStatusChange) {
                onStatusChange('auth_failure', { projectId: id, projectName: name, message: msg });
            }

            this.db.run('INSERT INTO logs (project_id, action, details) VALUES (?, ?, ?)',
                [id, 'AUTH_FAILURE', JSON.stringify({ message: msg })]);
        });

        // Message received (incoming)
        client.on('message', async (msg) => {
            console.log(`📨 [${name}] Message from ${msg.from}: ${msg.body?.substring(0, 50)}`);

            // Log incoming message
            this.db.run('INSERT INTO messages (project_id, direction, phone, content, status) VALUES (?, ?, ?, ?, ?)',
                [id, 'incoming', msg.from, msg.body, 'received']);

            // Check for auto-reply templates or commands
            await this.handleIncomingMessage(id, client, msg);
        });

        // Store bot instance
        this.bots.set(id, {
            client,
            status: 'initializing',
            info: null,
            projectName: name
        });

        // Initialize
        try {
            console.log(`⏳ [${name}] Initializing bot...`);
            
            // Check for existing session
            const sessionExists = fs.existsSync(path.join(sessionPath, 'session'));
            if (sessionExists) {
                console.log(`📱 [${name}] Existing session found, attempting to restore...`);
            } else {
                console.log(`📱 [${name}] No session found, QR code will be generated`);
            }

            await client.initialize();
            
            return { success: true, message: 'Bot initialized' };
        } catch (error) {
            console.error(`❌ [${name}] Failed to initialize:`, error.message);
            this.bots.delete(id);
            
            return { success: false, error: error.message };
        }
    }

    // Stop a bot
    stopBot(projectId) {
        const bot = this.bots.get(projectId);
        if (!bot) {
            console.log(`[${projectId}] Bot not running`);
            return false;
        }

        console.log(`🛑 Stopping bot ${projectId}`);
        
        try {
            bot.client.destroy();
            this.bots.delete(projectId);
            this.qrCallbacks.delete(projectId);
            
            // Update database
            this.db.run('UPDATE projects SET status = ? WHERE id = ?', ['inactive', projectId]);
            
            return true;
        } catch (error) {
            console.error(`❌ Error stopping bot:`, error);
            return false;
        }
    }

    // Send message
    async sendMessage(projectId, to, message) {
        const bot = this.bots.get(projectId);
        if (!bot) {
            throw new Error('Bot not running');
        }

        if (bot.status !== 'active') {
            throw new Error('Bot not ready');
        }

        try {
            // Format phone number
            let phone = to.replace(/\D/g, '');
            if (phone.startsWith('0')) {
                phone = '94' + phone.substring(1);
            }
            if (!phone.startsWith('94')) {
                phone = '94' + phone;
            }
            const chatId = `${phone}@c.us`;

            const result = await bot.client.sendMessage(chatId, message);
            
            return {
                success: true,
                messageId: result.id._serialized,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error(`❌ Failed to send message:`, error);
            throw error;
        }
    }

    // Get bot status
    getBotStatus(projectId) {
        const bot = this.bots.get(projectId);
        if (!bot) {
            return { connected: false, status: 'inactive' };
        }

        return {
            connected: bot.status === 'active',
            status: bot.status,
            info: bot.info,
            projectName: bot.projectName
        };
    }

    // Handle incoming messages (auto-reply, commands)
    async handleIncomingMessage(projectId, client, msg) {
        // Don't reply to own messages or status messages
        if (msg.fromMe || msg.type !== 'chat') return;

        const body = msg.body?.toLowerCase().trim();
        
        // Basic commands
        if (body === '!help') {
            const helpText = `🤖 Available Commands:\n\n!help - Show this help\n!status - Check bot status\n!ping - Test connection`;
            await msg.reply(helpText);
        } else if (body === '!status') {
            const bot = this.bots.get(projectId);
            const status = bot?.status || 'unknown';
            const phone = bot?.info?.wid?.user || 'not connected';
            await msg.reply(`🟢 Bot Status: ${status}\n📱 Connected: ${phone}`);
        } else if (body === '!ping') {
            await msg.reply('🏓 Pong! Bot is active.');
        }

        // You can add project-specific auto-reply logic here
        // by checking project configuration from database
    }

    // Get all running bots
    getRunningBots() {
        const list = [];
        this.bots.forEach((bot, id) => {
            list.push({
                projectId: id,
                projectName: bot.projectName,
                status: bot.status,
                connected: bot.status === 'active'
            });
        });
        return list;
    }

    // Restart all bots (useful after server restart)
    async restartAllBots() {
        console.log('\n🔄 Restarting all active bots...');
        
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM projects WHERE status = ?', ['active'], async (err, projects) => {
                if (err) {
                    reject(err);
                    return;
                }

                for (const project of projects) {
                    console.log(`🔄 Restarting: ${project.name}`);
                    try {
                        await this.startBot(project, (status, data) => {
                            console.log(`[${project.name}] Status: ${status}`);
                        });
                    } catch (error) {
                        console.error(`❌ Failed to restart ${project.name}:`, error.message);
                    }
                    
                    // Small delay between starting bots
                    await new Promise(r => setTimeout(r, 5000));
                }

                console.log('✅ Bot restart complete\n');
                resolve();
            });
        });
    }
}

module.exports = BotManager;
