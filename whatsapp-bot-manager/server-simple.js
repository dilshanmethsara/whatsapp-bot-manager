const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
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

// Simple JSON file storage
const dataPath = path.join(__dirname, 'data');
const projectsFile = path.join(dataPath, 'projects.json');
const botsFile = path.join(dataPath, 'bots.json');

// Initialize data directory and files
if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
}

if (!fs.existsSync(projectsFile)) {
    fs.writeFileSync(projectsFile, JSON.stringify([]));
}

if (!fs.existsSync(botsFile)) {
    fs.writeFileSync(botsFile, JSON.stringify({}));
}

// Helper functions for JSON storage
function readProjects() {
    try {
        const data = fs.readFileSync(projectsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

function writeProjects(projects) {
    fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2));
}

function readBots() {
    try {
        const data = fs.readFileSync(botsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

function writeBots(bots) {
    fs.writeFileSync(botsFile, JSON.stringify(bots, null, 2));
}

// Initialize Bot Manager
const botManager = new BotManager();

// API Routes

// Get all projects
app.get('/api/projects', (req, res) => {
    try {
        const projects = readProjects();
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new project
app.post('/api/projects', (req, res) => {
    try {
        const { name, description } = req.body;
        const projects = readProjects();
        
        const newProject = {
            id: uuidv4(),
            name,
            description,
            api_key: uuidv4(),
            bot_phone: null,
            status: 'inactive',
            config: '{}',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        projects.push(newProject);
        writeProjects(projects);
        
        res.json(newProject);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update project
app.put('/api/projects/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const projects = readProjects();
        
        const projectIndex = projects.findIndex(p => p.id === id);
        if (projectIndex === -1) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        projects[projectIndex] = {
            ...projects[projectIndex],
            name,
            description,
            updated_at: new Date().toISOString()
        };
        
        writeProjects(projects);
        res.json(projects[projectIndex]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete project
app.delete('/api/projects/:id', (req, res) => {
    try {
        const { id } = req.params;
        const projects = readProjects();
        
        const filteredProjects = projects.filter(p => p.id !== id);
        writeProjects(filteredProjects);
        
        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get bot status for project
app.get('/api/projects/:id/bot-status', (req, res) => {
    try {
        const { id } = req.params;
        const bots = readBots();
        const botStatus = bots[id] || { status: 'inactive', last_seen: null };
        res.json(botStatus);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start bot for project
app.post('/api/projects/:id/start-bot', async (req, res) => {
    try {
        const { id } = req.params;
        const projects = readProjects();
        const project = projects.find(p => p.id === id);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Start bot logic here
        const bots = readBots();
        bots[id] = {
            status: 'starting',
            last_seen: new Date().toISOString()
        };
        writeBots(bots);
        
        res.json({ message: 'Bot starting...', status: 'starting' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stop bot for project
app.post('/api/projects/:id/stop-bot', (req, res) => {
    try {
        const { id } = req.params;
        const bots = readBots();
        
        bots[id] = {
            status: 'inactive',
            last_seen: new Date().toISOString()
        };
        writeBots(bots);
        
        res.json({ message: 'Bot stopped successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`WhatsApp Bot Manager running on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
});
