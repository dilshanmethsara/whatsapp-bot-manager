# 🤖 WhatsApp Bot Manager

A complete **multi-project WhatsApp Bot Management System** that allows you to create and manage multiple WhatsApp bots for different projects, each with custom message templates and API access.

## ✨ Features

- ✅ **Create Multiple Bots** - One bot per project
- ✅ **Custom Message Templates** - Each project has its own templates
- ✅ **REST API** - External projects can send messages via API
- ✅ **Admin Dashboard** - Web interface to manage all bots
- ✅ **Session Persistence** - Bots stay connected after restart
- ✅ **Message Logs** - Track all sent/received messages
- ✅ **Auto-Reply** - Basic command responses (!help, !status)

## 🏗️ System Architecture

```
┌─────────────────┐
│  Admin Dashboard │ ← You manage all bots here
│   (Web UI)      │
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┐
    │         │        │        │
┌───▼───┐ ┌──▼───┐ ┌──▼───┐ ┌──▼───┐
│Bot 1  │ │Bot 2 │ │Bot 3 │ │Bot 4 │
│E-com  │ │School│ │Resto │ │Supp  │
└───┬───┘ └──────┘ └──────┘ └──────┘
    │
    └─────────────┐
                  │
        ┌─────────▼──────────┐
        │  Client Projects   │
        │  (API Integration) │
        └────────────────────┘
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Setup

```bash
npm run setup
```

This will:
- Create necessary directories
- Set up the database
- Create `.env` file with your admin password

### 3. Start Server

```bash
npm start
```

### 4. Open Dashboard

Go to: `http://localhost:3000`

Login with your admin password.

## 📋 Usage Guide

### Creating a New Project

1. Click "+ New Project" in dashboard
2. Enter project name and description
3. Click "Create Project"
4. Note down the **API Key** (you'll need it later)

### Starting a Bot

1. Find your project card
2. Click "Start Bot"
3. QR code will appear in server console
4. Scan with WhatsApp Business app
5. Bot status changes to "active"

### Adding Message Templates

1. Click "Templates" on your project
2. Add templates like:
   - `order_confirmation`: "Hello {name}, your order {orderId} is confirmed!"
   - `welcome`: "Welcome to {projectName}!"
3. Use `{variable}` syntax for dynamic content

### API for External Projects

#### Send Templated Message

```javascript
POST /api/send-message
Headers: Content-Type: application/json

Body:
{
  "api_key": "wb_xxxxx...",
  "template_name": "order_confirmation",
  "variables": {
    "name": "John",
    "orderId": "12345"
  },
  "to": "+94761234567"
}
```

#### Send Custom Message

```javascript
POST /api/send-custom-message
Headers: Content-Type: application/json

Body:
{
  "api_key": "wb_xxxxx...",
  "message": "Your custom message here",
  "to": "+94761234567"
}
```

#### Check Bot Status

```javascript
GET /api/status?api_key=wb_xxxxx...
```

## 💡 Example Use Cases

### E-commerce Store
```javascript
// Order confirmation
{
  "template_name": "order_confirmation",
  "variables": {
    "orderId": "12345",
    "amount": "5000",
    "status": "Pending"
  }
}
// Result: "🏪 HASA GOLD STORE\n\n✅ Order Received!\n\n📦 Order: #12345\n💰 Amount: LKR 5,000\n⏳ Status: Pending"
```

### School System
```javascript
// Exam results
{
  "template_name": "exam_results",
  "variables": {
    "studentName": "Alice",
    "subject": "Math",
    "marks": "85"
  }
}
```

### Restaurant
```javascript
// Order ready
{
  "template_name": "order_ready",
  "variables": {
    "orderId": "567",
    "estimatedTime": "15 minutes"
  }
}
```

## 📁 Project Structure

```
whatsapp-bot-manager/
├── server.js              # Main server
├── bot-manager.js         # Bot orchestrator
├── package.json           # Dependencies
├── setup.js              # Setup script
├── .env                  # Environment variables
├── README.md             # This file
├── data/                 # Database
│   └── bots.db
├── sessions/             # WhatsApp sessions
│   └── [project-id]/
└── public/               # Dashboard UI
    └── index.html
```

## 🔧 Admin API Endpoints

All admin endpoints require `x-admin-password` header.

- `GET /api/admin/projects` - List all projects
- `POST /api/admin/projects` - Create project
- `DELETE /api/admin/projects/:id` - Delete project
- `POST /api/admin/projects/:id/start` - Start bot
- `POST /api/admin/projects/:id/stop` - Stop bot
- `GET /api/admin/projects/:id/templates` - List templates
- `POST /api/admin/projects/:id/templates` - Add template
- `GET /api/admin/logs` - View system logs

## ⚙️ Configuration

Edit `.env` file:

```env
ADMIN_PASSWORD=your-secure-password
PORT=3000
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable  # Optional
```

## 🖥️ Deployment

### Local Development
```bash
npm install
npm run setup
npm run dev
```

### Production (Oracle Cloud Free Tier)

1. **Upload files to server**:
```bash
scp -i ~/.ssh/your-key.pem -r whatsapp-bot-manager/* ubuntu@YOUR_IP:/home/ubuntu/
```

2. **Install dependencies**:
```bash
ssh -i ~/.ssh/your-key.pem ubuntu@YOUR_IP

cd whatsapp-bot-manager
npm install
```

3. **Setup environment**:
```bash
cp .env.example .env
nano .env  # Edit your password
```

4. **Start with PM2** (keeps running):
```bash
npm install -g pm2
pm2 start server.js --name "whatsapp-bot-manager"
pm2 startup
pm2 save
```

5. **Access dashboard**:
Open `http://YOUR_IP:3000`

## 🔒 Security Notes

- Keep your `ADMIN_PASSWORD` secure
- Don't share API keys publicly
- Use HTTPS in production (nginx reverse proxy)
- Regularly backup the `data/` folder

## 🐛 Troubleshooting

### Bot won't start
- Check if Chrome is installed: `google-chrome --version`
- Check logs in dashboard
- Ensure port 3000 is open

### QR code not appearing
- Check server console logs
- Ensure no other bot is using the same session
- Delete session folder and restart: `rm -rf sessions/[project-id]`

### Messages not sending
- Check if bot status is "active"
- Verify phone number format (+9476...)
- Check message logs in dashboard

## 📞 Support

For issues or questions:
1. Check the logs in dashboard
2. Review server console output
3. Ensure all dependencies are installed

## 📝 License

MIT License - Use freely for your projects!

---

**Built with ❤️ for easy WhatsApp bot management**
