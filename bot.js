import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import { exec } from 'node:child_process';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { QBittorrent } from 'qbit.js';
import FormData from 'form-data';
dotenv.config();

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessageReactions
  ]
});

// // Configuration de Transmission
// const TRANSMISSION_URL = process.env.TRANSMISSION_URL;
// const USERNAME = process.env.TRANSMISSION_USER;
// const PASSWORD = process.env.TRANSMISSION_PASSWORD;

// Configuration des chemins
const QBITTORRENT_USER = process.env.QBITTORRENT_USER;
const QBITTORRENT_PASS = process.env.QBITTORRENT_PASS;
const QBITTORRENT_HOST = process.env.QBITTORRENT_HOST;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID; // YOUR LOG CHANNEL ID
const DISCORD_USER_ID = process.env.DISCORD_USER_ID; // YOUR DISCORD USER ID@
const LOG_FILE = process.env.LOG_FILE;
let SID = null; // Stocker l'ID de session

// Connexion à qBittorrent
const qbt = new QBittorrent('http://localhost:8080');

qbt.login('admin', 'qsdfgh')
  .then(() => {
    console.log('Connecté à qBittorrent !');
  })
  .catch(err => {
    console.error('Erreur de connexion :', err);
  });




// Fonction pour formater les logs comme PM2
function formatPm2Log(log) {
  const timestamp = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const appName = log.process?.name || 'DiscordBot';
  const processId = log.process?.pm_id || 0;
  const type = log.type === 'err' ? '❌ **ERROR**' : 'ℹ️ **INFO**';
  const message = log.message || 'Aucun message';

  return `**${appName}** (PID: ${processId}) | ${type}\n` +
         `🕒 **Date:** ${timestamp}\n` +
         `📝 **Message:**\n\`\`\`\n${message}\n\`\`\``;
}

// Fonction pour envoyer les logs dans Discord
async function logToDiscord(log) {
  try {
    if (!log || typeof log !== 'object' || !log.message) {
      return; // Ignore les logs invalides ou sans message
    }

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      const formattedLog = formatPm2Log(log);
      await logChannel.send({ content: formattedLog });
    } else {
      console.error('Le canal de logs n\'est pas un canal texte valide');
    }
  } catch (error) {
    console.error('Erreur lors de l\'envoi du log dans Discord:', error);
  }
}

// Rediriger les logs PM2 vers Discord
const pm2Logs = exec('pm2 logs --json');

pm2Logs.stdout.on('data', (data) => {
  const lines = data.toString().split('\n'); // Divise les données en lignes

  lines.forEach((line) => {
    try {
      if (line.trim()) { // Ignore les lignes vides
        const log = JSON.parse(line.trim()); // Parse chaque ligne
        logToDiscord(log);
      }
    } catch (error) {
      console.error('Erreur lors de la lecture des logs PM2:', error);
    }
  });
});

pm2Logs.stderr.on('data', (data) => {
  console.error('Erreur PM2:', data.toString());
});

// Initialisation du bot
client.on('ready', async () => {
  await logToDiscord(`Bot démarré en tant que ${client.user.tag}`);
  await login();
  console.log('Prêt !');
});

const sendLongMessage = async (channel, content) => {
  const maxLength = 2000 - 10; // Marge de sécurité
  if (content.length <= maxLength) {
    await channel.send(content);
    return;
  }

  // Découpage intelligent
  const parts = [];
  while (content.length) {
    let chunk = content.substring(0, maxLength);
    const lastNewLine = chunk.lastIndexOf('\n');
    if (lastNewLine > 0) {
      chunk = chunk.substring(0, lastNewLine);
      content = content.substring(lastNewLine + 1);
    } else {
      content = content.substring(maxLength);
    }
    parts.push(`\`\`\`\n${chunk}\n\`\`\``);
  }

  for (const part of parts) {
    await channel.send(part);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Anti-spam
  }
};

// Fonction pour se connecter à qBittorrent et obtenir l'ID de session
async function loginToQBittorrent() {
  try {
    // Vérifier si le service est actif
    await axios.get(QBITTORRENT_HOST, { timeout: 5000 });
    
    // Authentification
    const response = await axios.post(
      `${QBITTORRENT_HOST}/api/v2/auth/login`,
      `username=${QBITTORRENT_USER}&password=${QBITTORRENT_PASS}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: 10000
      }
    );

    // Gestion des erreurs de connexion
    if (response.data.includes('Fails')) {
      throw new Error('Identifiants qBittorrent incorrects');
    }

    // Récupération du SID
    const cookies = response.headers['set-cookie'];
    if (!cookies) throw new Error('Aucun cookie de session reçu');
    
    SID = cookies[0].split('=')[1].split(';')[0];
    console.log('Connexion réussie. SID:', SID);
    return true;

  } catch (error) {
    console.error('Échec de connexion à qBittorrent:', {
      code: error.code,
      message: error.message,
      config: error.config?.url
    });
    return false;
  }
}

// Fonction pour ajouter un torrent
async function addTorrent(url, savePath) {
  try {
    // 1. Télécharger le fichier .torrent
    const torrentFile = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    // 2. Créer le FormData SPÉCIFIQUE pour qBittorrent
    const form = new FormData();
    form.append('torrents', torrentFile.data, {
      filename: 'file.torrent',
      contentType: 'application/x-bittorrent',
      knownLength: torrentFile.data.length
    });

    // 3. Préparer les headers MANUELLEMENT
    const headers = {
      'Cookie': `SID=${SID}`,
      'Content-Type': `multipart/form-data; boundary=${form.getBoundary()}`,
      'User-Agent': 'Mozilla/5.0',
      'Content-Length': form.getLengthSync()
    };

    // 4. Envoyer la requête
    const response = await axios.post(
      `${QBITTORRENT_HOST}/api/v2/torrents/add`,
      form.getBuffer(),
      { headers }
    );

    return response.status === 200 
      ? '✅ Torrent ajouté avec succès !' 
      : '❌ Réponse inattendue du serveur';
    
  } catch (error) {
    console.error('Erreur technique:', {
      code: error.code,
      message: error.message,
      response: error.response?.data
    });
    return '❌ Erreur lors de l\'ajout du torrent';
  }
}

// Fonction pour obtenir la liste des torrents
async function getTorrentList() {
  if (!SID) {
    const loggedIn = await loginToQBittorrent();
    if (!loggedIn) return null;
  }

  try {
    const response = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/info`, {
      headers: {
        'Cookie': `SID=${SID}`
      }
    });

    return response.data;
  } catch (error) {
    console.error('Erreur lors de la récupération de la liste des torrents:', error);
    return null;
  }
}

// Fonction pour formater les vitesses
function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond === 0) return '0 B/s';
  
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let i = 0;
  
  while (bytesPerSecond >= 1024 && i < units.length - 1) {
    bytesPerSecond /= 1024;
    i++;
  }
  
  return `${bytesPerSecond.toFixed(1)} ${units[i]}`;
}

// Fonction pour formater la taille
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  
  return `${bytes.toFixed(2)} ${units[i]}`;
}

// Événements sur les messages
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Vérifiez que l'utilisateur a les permissions nécessaires
  if (message.author.id !== DISCORD_USER_ID) {
    return message.channel.send('❌ Vous n\'avez pas la permission d\'exécuter cette commande.');
  }

  await logToDiscord(`Message reçu de ${message.author.tag}: ${message.content}`);


  // Gestion des fichiers .torrent
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (attachment.name.endsWith('.torrent')) {
      try {
        // Télécharger le fichier
        const response = await axios.get(attachment.url, {
          responseType: 'arraybuffer',
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        // Créer le FormData
        const form = new FormData();
        form.append('torrents', Buffer.from(response.data), {
          filename: 'file.torrent',
          contentType: 'application/x-bittorrent'
        });

        // Envoyer la requête
        await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/add`, form, {
          headers: {
            'Cookie': `SID=${SID}`,
            ...form.getHeaders()
          }
        });

        // Attendre que le torrent soit ajouté
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Récupérer les infos du torrent ajouté
        const torrentInfo = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/info`, {
          headers: { 'Cookie': `SID=${SID}` }
        });

        // Trouver le torrent par son nom (sans l'extension .torrent)
        const torrentName = attachment.name.replace('.torrent', '');
        const addedTorrent = torrentInfo.data.find(t => 
          t.name.toLowerCase().includes(torrentName.toLowerCase())
        );

        if (addedTorrent) {
          const statusMessage = `
✅ **Torrent ajouté avec succès !**

🔹 **${addedTorrent.name}**
   - État: ${addedTorrent.state}
   - Progression: ${(addedTorrent.progress * 100).toFixed(1)}%
   - Taille: ${formatSize(addedTorrent.size)}
   - Téléchargé: ${formatSize(addedTorrent.completed)}
   - Vitesse ↓: ${formatSpeed(addedTorrent.dlspeed)}
   - Vitesse ↑: ${formatSpeed(addedTorrent.upspeed)}
   - Ratio: ${addedTorrent.ratio.toFixed(2)}
   - ETA: ${addedTorrent.eta > 0 ? `${Math.floor(addedTorrent.eta / 3600)}h ${Math.floor((addedTorrent.eta % 3600) / 60)}m` : 'Terminé'}
          `;

          const sentMessage = await message.channel.send(statusMessage);

          // Ajouter les réactions
          await sentMessage.react('▶️'); // Play
          await sentMessage.react('⏸️'); // Pause
          await sentMessage.react('⏩'); // Force Start
          await sentMessage.react('🗑️'); // Delete
          await sentMessage.react('⏹️'); // Stop

          // Gestion des réactions
          const filter = (reaction, user) => {
            return ['▶️', '⏸️', '⏩', '🗑️', '⏹️'].includes(reaction.emoji.name) &&
                   user.id === message.author.id;
          };

          const collector = sentMessage.createReactionCollector({ filter, time: 60000 });

          collector.on('collect', async (reaction, user) => {
            try {
              let action;
              switch (reaction.emoji.name) {
                case '▶️': action = 'resume'; break;
                case '⏸️': action = 'pause'; break;
                case '⏩': action = 'setForceStart'; break;
                case '🗑️': action = 'delete'; break;
                case '⏹️': action = 'stop'; break;
              }

              await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/${action}`, `hashes=${addedTorrent.hash}`, {
                headers: { 'Cookie': `SID=${SID}` }
              });

              await sentMessage.reply(`✅ Action "${reaction.emoji.name}" effectuée sur ${addedTorrent.name}`);
            } catch (error) {
              console.error('Erreur action:', error);
              sentMessage.reply(`❌ Erreur lors de l'action "${reaction.emoji.name}"`);
            }
          });
        } else {
          message.reply('✅ Torrent ajouté, mais impossible de récupérer les informations.');
        }
      } catch (error) {
        message.reply(`❌ Erreur lors de l'ajout du torrent : ${error.message}`);
      }
    }
  }

  // Commande pour ajouter un torrent
  if (message.content.startsWith('!add')) {
    const args = message.content.split(' ');
    if (args.length < 2) {
      return message.reply('Usage: !add <url>');
    }

    const url = args[1];
    const savePath = '/mnt/jaaf_hdd/torrents'; // Chemin par défaut
    const result = await addTorrent(url, savePath);
    message.reply(result);
  }

  // Commande pour lister les torrents
  if (message.content.startsWith('!list')) {
    const torrents = await getTorrentList();
    if (torrents) {
      const torrentList = torrents.map(t => `- ${t.name} (${t.state})`).join('\n');
      message.reply(`Liste des torrents:\n${torrentList}`);
    } else {
      message.reply('Erreur lors de la récupération de la liste des torrents.');
    }
  }

  if (message.content === '!status') {
    exec('/home/Jaafar/discord_notify.sh status', 
      { timeout: 10000 }, // Augmenter le timeout
      (error, stdout, stderr) => {
        let response = '';
        
        if (error) {
          console.error('Erreur !status:', error);
          response = `❌ Erreur ${error.code} : ${error.signal || 'Timeout'}`;
        } else {
          // Formater la sortie du script
          const output = stdout.toString().trim();
          response = `📊 **Status système** :\n\`\`\`bash\n${output}\n\`\`\``;
        }

        message.channel.send(response);
    });
  }

  if (message.content === '!reboot') {
    exec('qbt reboot', (error, stdout, stderr) => {
      if (error) {
        console.error('Erreur lors de l\'exécution de la commande !reboot:', error);
        return message.channel.send('❌ Erreur lors de l\'exécution de la commande !reboot.');
      }
      message.channel.send(stdout || stderr);
    });
  }

  if (message.content === '!test') {
    console.log('Commande test reçue');
    await message.channel.send('✅ Le bot fonctionne !');
  }

  if (message.content === '!logs') {
    try {
        // Lire les 10 dernières lignes du fichier log
        const logData = fs.readFileSync(LOG_FILE, 'utf8');
        const lines = logData.split('\n').filter(line => line.trim() !== '');
        const lastLines = lines.slice(-10).join('\n');
        
        if (lastLines.length > 0) {
            message.channel.send(`📜 **Derniers logs** :\n\`\`\`\n${lastLines}\n\`\`\``);
        } else {
            message.channel.send('Aucun log disponible.');
        }
    } catch (error) {
        console.error('Erreur lors de la lecture des logs:', error);
        message.channel.send('❌ Erreur lors de la lecture des logs');
    }
  }

  // Commande !statustorrent
  if (message.content.startsWith('!statustorrent')) {
    try {
      // Vérifier la connexion
      if (!SID) {
        const loggedIn = await loginToQBittorrent();
        if (!loggedIn) return message.reply('❌ Connexion à qBittorrent échouée');
      }

      // Récupérer les infos des torrents
      const response = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/info`, {
        headers: { 'Cookie': `SID=${SID}` }
      });

      if (response.status === 200 && response.data.length > 0) {
        for (const torrent of response.data) {
          const statusMessage = `
🔹 **${torrent.name}**
   - État: ${torrent.state}
   - Progression: ${(torrent.progress * 100).toFixed(1)}%
   - Taille: ${formatSize(torrent.size)}
   - Téléchargé: ${formatSize(torrent.completed)}
   - Vitesse ↓: ${formatSpeed(torrent.dlspeed)}
   - Vitesse ↑: ${formatSpeed(torrent.upspeed)}
   - Ratio: ${torrent.ratio.toFixed(2)}
   - ETA: ${torrent.eta > 0 ? `${Math.floor(torrent.eta / 3600)}h ${Math.floor((torrent.eta % 3600) / 60)}m` : 'Terminé'}
          `;

          // Envoyer un message par torrent
          const sentMessage = await message.channel.send(statusMessage);

          // Ajouter les réactions en fonction de l'état
          await sentMessage.react('▶️'); // Play
          await sentMessage.react('⏸️'); // Pause
          await sentMessage.react('⏩'); // Force Start
          await sentMessage.react('🗑️'); // Delete
          await sentMessage.react('⏹️'); // Stop

          // Gestion des réactions
          const filter = (reaction, user) => {
            return ['▶️', '⏸️', '⏩', '🗑️', '⏹️'].includes(reaction.emoji.name) &&
                   user.id === message.author.id;
          };

          const collector = sentMessage.createReactionCollector({ filter, time: 60000 });

          collector.on('collect', async (reaction, user) => {
            try {
              let action;
              switch (reaction.emoji.name) {
                case '▶️': action = 'resume'; break;
                case '⏸️': action = 'pause'; break;
                case '⏩': action = 'setForceStart'; break;
                case '🗑️': action = 'delete'; break;
                case '⏹️': action = 'stop'; break;
              }

              await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/${action}`, `hashes=${torrent.hash}`, {
                headers: { 'Cookie': `SID=${SID}` }
              });

              await sentMessage.reply(`✅ Action "${reaction.emoji.name}" effectuée sur ${torrent.name}`);
            } catch (error) {
              console.error('Erreur action:', error);
              sentMessage.reply(`❌ Erreur lors de l'action "${reaction.emoji.name}"`);
            }
          });
        }
      } else {
        message.reply('Aucun torrent actif.');
      }
    } catch (error) {
      console.error('Erreur API:', error.response?.data || error.message);
      message.reply('❌ Erreur API - Vérifiez les logs');
    }
  }
});

client.on('error', async (error) => {
    await logToDiscord(`Erreur du bot: ${error.message}`);
});

client.on('warn', async (info) => {
    await logToDiscord(`Avertissement du bot: ${info}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);