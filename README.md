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

## Contributing

Contributions are welcome! Open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Author

[Jaafar](https://github.com/your-username)
