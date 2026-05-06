const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('\n🚀 WhatsApp Bot Manager - Setup\n');

async function setup() {
    // Create directories
    const dirs = ['data', 'sessions', 'public'];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`✅ Created directory: ${dir}`);
        }
    });

    // Check if .env exists
    if (!fs.existsSync('.env')) {
        console.log('\n📝 Creating .env file...');
        
        const password = await askQuestion('Enter admin password: ');
        const port = await askQuestion('Enter server port (default 3000): ') || '3000';
        
        const envContent = `ADMIN_PASSWORD=${password}
PORT=${port}
NODE_ENV=production
`;
        
        fs.writeFileSync('.env', envContent);
        console.log('✅ .env file created');
    } else {
        console.log('✅ .env file already exists');
    }

    // Initialize database
    console.log('\n🗄️  Initializing database...');
    const dbPath = path.join(__dirname, 'data', 'bots.db');
    
    const db = new sqlite3.Database(dbPath);
    
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

    db.close();
    console.log('✅ Database initialized');

    console.log('\n✅ Setup complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Install dependencies: npm install');
    console.log('2. Start the server: npm start');
    console.log('3. Open dashboard: http://localhost:3000');
    console.log('\n🚀 Happy bot managing!\n');
    
    rl.close();
}

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

setup().catch(console.error);
