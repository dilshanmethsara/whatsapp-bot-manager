const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

class BotManager {
    constructor(db) {
        this.db = db;
        this.bots = new Map(); // projectId -> { socket, status, restarting }
        this.retryCounts = new Map();
        this.restarting = new Set();
    }

    getRetry(projectId) {
        return this.retryCounts.get(projectId) || 0;
    }

    setRetry(projectId, v) {
        this.retryCounts.set(projectId, v);
    }

    clearRetry(projectId) {
        this.retryCounts.delete(projectId);
    }

    // 🔥 DESTROY BOT PROPERLY
    async destroyBot(projectId) {
        const bot = this.bots.get(projectId);
        if (!bot) return;

        try {
            bot.socket?.ev?.removeAllListeners?.();
            bot.socket?.ws?.close?.();
            bot.socket?.end?.();
        } catch (e) {}

        this.bots.delete(projectId);
    }

    async startBot(project, onStatusChange) {
        const { id, name, bot_phone } = project;

        // ❌ prevent multiple loops
        if (this.restarting.has(id)) {
            console.log(`⛔ [${id}] Restart already in progress`);
            return;
        }

        if (this.bots.has(id)) {
            console.log(`⛔ [${id}] Bot already running`);
            return;
        }

        this.restarting.add(id);

        console.log(`\n🚀 Starting bot: ${name}`);

        const sessionPath = path.join(__dirname, 'sessions', id);

        // clean only if corrupted start
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['Chrome', 'Windows', '10'],
            markOnlineOnConnect: false,
            syncFullHistory: false,
            fireInitQueries: false
        });

        this.bots.set(id, {
            socket,
            status: 'starting'
        });

        socket.ev.on('creds.update', saveCreds);

        socket.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;

            // 📱 QR
            if (qr) {
                const qrImage = await qrcode.toDataURL(qr);
                console.log(`📱 QR generated for ${name}`);

                onStatusChange?.('qr', {
                    qr: qrImage,
                    projectId: id
                });
            }

            // ✅ CONNECTED
            if (connection === 'open') {
                console.log(`✅ Connected: ${name}`);

                this.restarting.delete(id);
                this.setRetry(id, 0);

                this.bots.set(id, {
                    socket,
                    status: 'connected'
                });

                onStatusChange?.('connected', { projectId: id });
            }

            // ❌ DISCONNECTED
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(`❌ Disconnected: ${name} | code: ${statusCode}`);

                await this.destroyBot(id);

                this.restarting.delete(id);

                if (!shouldReconnect) {
                    console.log(`🚫 Logged out: ${name}`);
                    return;
                }

                // 🔁 safe retry (NO SPAM)
                const retry = this.getRetry(id);
                const delay = Math.min(5000 * (retry + 1), 30000);

                this.setRetry(id, retry + 1);

                console.log(`🔄 Reconnecting in ${delay / 1000}s`);

                setTimeout(() => {
                    this.startBot(project, onStatusChange);
                }, delay);
            }
        });

        socket.ev.on('messages.upsert', async (m) => {
            const msg = m.messages?.[0];
            if (!msg?.message) return;

            const from = msg.key.remoteJid;
            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                '';

            console.log(`📩 ${name}: ${from} → ${text}`);

            this.db.run(
                'INSERT INTO messages (project_id, from_number, message_content, timestamp) VALUES (?, ?, ?, ?)',
                [id, from, text, new Date().toISOString()]
            );
        });

        return { success: true };
    }

    async sendMessage(projectId, to, message) {
        const bot = this.bots.get(projectId);
        if (!bot || bot.status !== 'connected') {
            return { success: false, error: 'Bot not connected' };
        }

        await bot.socket.sendMessage(to, { text: message });

        return { success: true };
    }

    getBotStatus(id) {
        return this.bots.get(id)?.status || 'stopped';
    }
}

module.exports = BotManager;