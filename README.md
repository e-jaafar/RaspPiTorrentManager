# RaspPiTorrentManager - qBittorrent Management via Discord

RaspPiTorrentManager is a Discord bot that allows you to remotely manage your qBittorrent instance. Add torrents, check download status, and control your torrents directly from Discord.

## Features

- **Add Torrents** : Add torrents via links or `.torrent` files.
- **Torrent Status** : Check the status, progress, speed, and ETA of your torrents.
- **Torrent Control** : Resume, pause, force start, stop, or delete torrents.
- **System Logs** : View system logs and server status.
- **Secure** : SSH key authentication and Discord permission management.

## Prerequisites

- Node.js (v16 or higher)
- qBittorrent (with Web UI enabled)
- A Discord bot (created via the [Developer Portal](https://discord.com/developers/applications))

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/RaspPiTorrentManager.git
   cd RaspPiTorrentManager
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   - Create a `.env` file in the root directory:
     ```env
     DISCORD_BOT_TOKEN=your_discord_bot_token
     QBITTORRENT_USER=your_qbittorrent_username
     QBITTORRENT_PASS=your_qbittorrent_password
     QBITTORRENT_HOST=http://your.qbittorrent.host:8080
     LOG_CHANNEL_ID=your_log_channel_id
     DISCORD_USER_ID=your_discord_user_id
     LOG_FILE=/path/to/logfile.log
     ```

4. Start the bot:
   ```bash
   node bot.js
   ```

## Commands

- **!add <url>** : Add a torrent via a link.
- **!list** : List all active torrents.
- **!statustorrent** : Show detailed status of each torrent.
- **!status** : Display system status.
- **!reboot** : Reboot the server (if configured).
- **!logs** : Show the latest system logs.

## Security

- **SSH Key Authentication** : Use SSH keys to secure access to your server.
- **Discord Permissions** : Only the user specified in `DISCORD_USER_ID` can execute commands.
- **Firewall** : Ensure the SSH port is secure and only necessary ports are open.

---

## Discord Notify Script

The `discord_notify.sh` script is a utility for sending notifications to Discord when your Raspberry Pi starts, shuts down, or reboots. It also provides system status information such as CPU temperature, disk usage, and uptime.

### **Features**
- **Startup Notification** : Sends a message when the Pi boots up, including downtime since the last shutdown.
- **Shutdown Notification** : Sends a message when the Pi shuts down, including uptime before shutdown.
- **Reboot Notification** : Sends a message before rebooting the Pi.
- **System Status** : Includes CPU temperature, disk usage, and IP address in notifications.

### **Configuration**
1. **Create a `.env` file** :
   - Add the following variables to a `.env` file in the same directory as the script:
     ```env
     # Discord Webhook URL
     WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_url

     # Log File Path
     LOG_FILE=/path/to/pi_status.log
     ```

2. **Set up the script** :
   - Make the script executable:
     ```bash
     chmod +x discord_notify.sh
     ```

3. **Add the script to system services** :
   - For startup notifications, add the script to `/etc/rc.local`:
     ```bash
     /path/to/discord_notify.sh allumé &
     ```
   - For shutdown notifications, create a systemd service or use a shutdown hook.

4. **Test the script** :
   - Run the script manually to test it:
     ```bash
     ./discord_notify.sh allumé
     ./discord_notify.sh éteint
     ./discord_notify.sh reboot
     ```

### **Usage**
- **Startup** : Automatically sends a notification when the Pi boots up.
- **Shutdown** : Automatically sends a notification when the Pi shuts down.
- **Reboot** : Sends a notification and reboots the Pi.

### **Example Notifications**
- **Startup** :
  ```
  🟢 **Raspberry Pi allumé**
  - Heure: 02/03/2024 14:30:00
  - Temps d'arrêt: 02h 15m 30s
  - Uptime: 5 minutes
  - CPU: 45°C
  - HDD: 25% used (50GB/200GB)
  - IP: 192.168.1.100
  ```

- **Shutdown** :
  ```
  🔴 **Raspberry Pi éteint**
  - Heure: 02/03/2024 15:00:00
  - Uptime précédent: 30 minutes
  - CPU: 50°C
  - HDD: 25% used (50GB/200GB)
  ```

- **Reboot** :
  ```
  🔄 **Raspberry Pi redémarrage**
  - Heure: 02/03/2024 15:05:00
  - Uptime: 35 minutes
  Le système va redémarrer dans 5 secondes...
  ```

### **Dependencies**
- `curl` : For sending HTTP requests to Discord.
- `jq` : For formatting JSON data.

Install them with:
```bash
sudo apt install curl jq
```

### **License**
This script is open-source and available under the [MIT License](LICENSE).


## Author

[Jaafar](https://github.com/e-jaafar)
