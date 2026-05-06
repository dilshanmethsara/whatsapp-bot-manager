const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Bot Manager
const BotManager = require('./bot-manager-baileys');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Healthcheck endpoint for Railway
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Initialize Database
const dbPath = path.join(__dirname, 'data', 'bots.db');
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Initialize Database Tables
db.serialize(() => {
    // Projects table
    db.run(`CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        api_key TEXT UNIQUE NOT NULL,
        bot_phone TEXT,
        status TEXT DEFAULT 'inactive',
        config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Templates table
    db.run(`CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        variables TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
    )`);

    // Messages table
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        phone TEXT NOT NULL,
        content TEXT,
        template_name TEXT,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
    )`);

    // Logs table
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Initialize Bot Manager
const botManager = new BotManager(db);

// ==================== ADMIN API ROUTES ====================

// Authentication middleware
function authenticateAdmin(req, res, next) {
    const password = req.headers['x-admin-password'] || req.body.password;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
}

// Get all projects
app.get('/api/admin/projects', authenticateAdmin, (req, res) => {
    db.all('SELECT * FROM projects ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, projects: rows });
    });
});

// Create new project
app.post('/api/admin/projects', authenticateAdmin, (req, res) => {
    const { name, description, bot_phone, config } = req.body;
    const id = uuidv4();
    const apiKey = 'wb_' + uuidv4().replace(/-/g, '');

    const sql = `INSERT INTO projects (id, name, description, api_key, bot_phone, config) 
                 VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [id, name, description, apiKey, bot_phone, JSON.stringify(config || {})], function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }

        // Log action
        db.run('INSERT INTO logs (project_id, action, details) VALUES (?, ?, ?)', 
            [id, 'PROJECT_CREATED', JSON.stringify({ name })]);

        res.json({ 
            success: true, 
            project: { id, name, api_key: apiKey },
            message: 'Project created successfully. Start the bot to generate QR code.'
        });
    });
});

// Delete project
app.delete('/api/admin/projects/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    
    // Stop bot if running
    botManager.stopBot(id);

    db.run('DELETE FROM projects WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }

        db.run('DELETE FROM templates WHERE project_id = ?', [id]);
        db.run('INSERT INTO logs (project_id, action, details) VALUES (?, ?, ?)', 
            [id, 'PROJECT_DELETED', '{}']);

        res.json({ success: true, message: 'Project deleted' });
    });
});

// Get project templates
app.get('/api/admin/projects/:id/templates', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    db.all('SELECT * FROM templates WHERE project_id = ?', [id], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, templates: rows });
    });
});

// Add template
app.post('/api/admin/projects/:id/templates', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { name, content, variables } = req.body;

    const sql = `INSERT INTO templates (project_id, name, content, variables) 
                 VALUES (?, ?, ?, ?)`;
    
    db.run(sql, [id, name, content, JSON.stringify(variables || [])], function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, template_id: this.lastID });
    });
});

// Update template
app.put('/api/admin/templates/:templateId', authenticateAdmin, (req, res) => {
    const { templateId } = req.params;
    const { name, content, variables, enabled } = req.body;

    const sql = `UPDATE templates SET name = ?, content = ?, variables = ?, enabled = ? 
                 WHERE id = ?`;
    
    db.run(sql, [name, content, JSON.stringify(variables || []), enabled ? 1 : 0, templateId], function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: 'Template updated' });
    });
});

// Delete template
app.delete('/api/admin/templates/:templateId', authenticateAdmin, (req, res) => {
    const { templateId } = req.params;
    db.run('DELETE FROM templates WHERE id = ?', [templateId], function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: 'Template deleted' });
    });
});

// Start bot
app.post('/api/admin/projects/:id/start', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM projects WHERE id = ?', [id], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }

        botManager.startBot(row, (status, data) => {
            if (status === 'qr') {
                // Emit QR to connected clients
                io.emit(`qr:${id}`, data);
            } else if (status === 'ready') {
                db.run('UPDATE projects SET status = ? WHERE id = ?', ['active', id]);
            }
        });

        res.json({ success: true, message: 'Bot starting... Check console for QR code' });
    });
});

// Stop bot
app.post('/api/admin/projects/:id/stop', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    botManager.stopBot(id);
    db.run('UPDATE projects SET status = ? WHERE id = ?', ['inactive', id]);
    res.json({ success: true, message: 'Bot stopped' });
});

// Get logs
app.get('/api/admin/logs', authenticateAdmin, (req, res) => {
    const { limit = 100 } = req.query;
    db.all('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, logs: rows });
    });
});

// Get messages for project
app.get('/api/admin/projects/:id/messages', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    db.all('SELECT * FROM messages WHERE project_id = ? ORDER BY created_at DESC LIMIT ?', 
        [id, limit], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, messages: rows });
    });
});

// ==================== PUBLIC API ROUTES ====================

// Send message using template
app.post('/api/send-message', async (req, res) => {
    const { api_key, template_name, variables, to } = req.body;

    if (!api_key || !template_name || !to) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: api_key, template_name, to' 
        });
    }

    // Find project by API key
    db.get('SELECT * FROM projects WHERE api_key = ?', [api_key], async (err, project) => {
        if (err || !project) {
            return res.status(401).json({ success: false, error: 'Invalid API key' });
        }

        if (project.status !== 'active') {
            return res.status(400).json({ success: false, error: 'Bot is not active' });
        }

        // Get template
        db.get('SELECT * FROM templates WHERE project_id = ? AND name = ? AND enabled = 1', 
            [project.id, template_name], async (err, template) => {
            if (err || !template) {
                return res.status(404).json({ success: false, error: 'Template not found' });
            }

            // Replace variables in template
            let message = template.content;
            if (variables) {
                Object.keys(variables).forEach(key => {
                    message = message.replace(new RegExp(`{${key}}`, 'g'), variables[key]);
                });
            }

            // Send message
            try {
                const result = await botManager.sendMessage(project.id, to, message);
                
                // Log message
                db.run('INSERT INTO messages (project_id, direction, phone, content, template_name, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [project.id, 'outgoing', to, message, template_name, 'sent']);

                res.json({ 
                    success: true, 
                    messageId: result.messageId,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                // Log failed message
                db.run('INSERT INTO messages (project_id, direction, phone, content, template_name, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [project.id, 'outgoing', to, message, template_name, 'failed', error.message]);

                res.status(500).json({ success: false, error: error.message });
            }
        });
    });
});

// Send custom message (no template)
app.post('/api/send-custom-message', async (req, res) => {
    const { api_key, message, to } = req.body;

    if (!api_key || !message || !to) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: api_key, message, to' 
        });
    }

    // Find project by API key
    db.get('SELECT * FROM projects WHERE api_key = ?', [api_key], async (err, project) => {
        if (err || !project) {
            return res.status(401).json({ success: false, error: 'Invalid API key' });
        }

        if (project.status !== 'active') {
            return res.status(400).json({ success: false, error: 'Bot is not active' });
        }

        // Send message
        try {
            const result = await botManager.sendMessage(project.id, to, message);
            
            // Log message
            db.run('INSERT INTO messages (project_id, direction, phone, content, status) VALUES (?, ?, ?, ?, ?)',
                [project.id, 'outgoing', to, message, 'sent']);

            res.json({ 
                success: true, 
                messageId: result.messageId,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            db.run('INSERT INTO messages (project_id, direction, phone, content, status, error_message) VALUES (?, ?, ?, ?, ?, ?)',
                [project.id, 'outgoing', to, message, 'failed', error.message]);

            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// Get bot status
app.get('/api/status', (req, res) => {
    const { api_key } = req.query;
    
    if (!api_key) {
        return res.status(400).json({ success: false, error: 'API key required' });
    }

    db.get('SELECT id, name, status, bot_phone FROM projects WHERE api_key = ?', [api_key], (err, project) => {
        if (err || !project) {
            return res.status(401).json({ success: false, error: 'Invalid API key' });
        }

        const botStatus = botManager.getBotStatus(project.id);
        
        res.json({
            success: true,
            project: {
                id: project.id,
                name: project.name,
                status: project.status,
                bot_phone: project.bot_phone,
                connected: botStatus.connected,
                info: botStatus.info
            }
        });
    });
});

// ==================== DASHBOARD ====================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================

const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Socket.io for real-time updates
io.on('connection', (socket) => {
    console.log('Client connected to dashboard');
    
    socket.on('subscribe', (projectId) => {
        socket.join(`project:${projectId}`);
    });
});

server.listen(PORT, () => {
    console.log('\n🚀 ==========================================');
    console.log('🚀 WhatsApp Bot Manager Started!');
    console.log('🚀 ==========================================');
    console.log(`\n📱 Dashboard: http://localhost:${PORT}`);
    console.log(`🔑 Admin Password: ${ADMIN_PASSWORD}`);
    console.log(`\n📁 Database: ${dbPath}`);
    console.log('\n✅ Ready to create projects!\n');
});

module.exports = { app, db, botManager };
