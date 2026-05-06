# Deploy WhatsApp Bot Manager to Railway

## Quick Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

## Manual Deploy Steps

### 1. Push Code to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-bot-manager.git
git push -u origin main
```

### 2. Create Railway Project

1. Go to [Railway.app](https://railway.app)
2. Sign up/login with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your `whatsapp-bot-manager` repository

### 3. Configure Environment Variables

Add these variables in Railway Dashboard → Variables:

```
ADMIN_PASSWORD=your-secure-admin-password
PORT=3000
NODE_ENV=production
```

### 4. Deploy

Railway will automatically:
- Detect Node.js app
- Install dependencies (`npm install`)
- Start server (`node server.js`)
- Provide public URL

### 5. Get Public URL

After deployment, Railway provides a public URL like:
```
https://whatsapp-bot-manager-production-xxx.up.railway.app
```

Use this URL to access your bot manager from anywhere!

## Important Notes for Railway

### Session Persistence
Railway's filesystem is ephemeral. For production use:
- Sessions will reset on redeploy
- Consider using Railway volumes for persistent storage

### WhatsApp Connection Issues
If you get "Connection Failure" errors:
1. Railway IPs might be blocked by WhatsApp
2. Use pairing code method instead of QR
3. Deploy to a different region (try US, EU, Asia)

### Free Tier Limits
- 500 hours/month runtime (good for testing)
- Sleep after inactivity (bot will disconnect)
- Upgrade to Pro for 24/7 uptime

### Recommended: Add Volume for Sessions

To keep WhatsApp sessions persistent:

1. Railway Dashboard → Volumes
2. Create volume: `sessions-data`
3. Mount path: `/app/sessions`
4. Update `bot-manager-baileys.js` session path

## Troubleshooting

### Health Check Failed
The app exposes `/health` endpoint. Railway uses this to verify the app is running.

### Build Failed
Check logs in Railway Dashboard. Usually due to:
- Missing dependencies
- Node.js version mismatch
- Build script errors

### WhatsApp Not Connecting
- Check Railway logs for errors
- Try different WhatsApp number
- Use pairing code instead of QR
- Deploy to different Railway region

## Support

For Railway-specific issues:
- [Railway Docs](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)

For Baileys/WhatsApp issues:
- [Baileys GitHub](https://github.com/WhiskeySockets/Baileys)
