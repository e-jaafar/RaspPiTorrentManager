import { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import axios from 'axios';
import { exec } from 'node:child_process';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { QBittorrent } from 'qbit.js';
import FormData from 'form-data';
import QuickChart from 'quickchart-js';
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
const qbt = new QBittorrent(QBITTORRENT_HOST);

qbt.login(QBITTORRENT_USER, QBITTORRENT_PASS)
  .then(() => {
    console.log('Connecté à qBittorrent !');
  })
  .catch(err => {
    console.error('Erreur de connexion :', err);
  });

// Suppression de la configuration par défaut du code
// et modification de la gestion de la configuration
let config = null;

// Fonction pour charger la configuration
function loadConfig() {
  try {
    if (!fs.existsSync('config.json')) {
      throw new Error('Le fichier config.json n\'existe pas');
    }
    
    const savedConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    if (!savedConfig.bot || !savedConfig.pm2) {
      throw new Error('Configuration invalide: les sections bot et pm2 sont requises');
    }
    
    config = savedConfig;
    console.log('Configuration chargée avec succès');
    return true;
  } catch (error) {
    console.error('Erreur critique lors du chargement de la configuration:', error);
    console.error('Veuillez vérifier que le fichier config.json existe et est valide');
    process.exit(1); // Arrêt du bot si pas de configuration valide
  }
}

// Fonction pour sauvegarder la configuration
function saveConfig() {
  try {
    if (!config) {
      throw new Error('Aucune configuration à sauvegarder');
    }
    fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
    console.log('Configuration sauvegardée avec succès');
    return true;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de la configuration:', error);
    return false;
  }
}

// Charger la configuration au démarrage
loadConfig();

// Mettre à jour les références dans le code
let botConfig = config.bot;

// Fonction pour afficher la configuration actuelle de manière formatée
function formatConfig(config) {
  return `📁 **Configuration complète**:

🤖 **Configuration du Bot**:
${Object.entries(config.bot)
  .map(([key, value]) => `• ${key}: ${value}`)
  .join('\n')}

⚙️ **Configuration PM2**:
${Object.entries(config.pm2)
  .map(([key, value]) => {
    if (typeof value === 'object') {
      return `• ${key}:\n${Object.entries(value)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join('\n')}`;
    }
    return `• ${key}: ${value}`;
  })
  .join('\n')}`;
}

// Fonction pour formater les logs comme PM2
function formatPm2Log(log) {
  try {
    // Si le log est une chaîne, essayer de le parser en JSON
    if (typeof log === 'string') {
      try {
        log = JSON.parse(log);
      } catch {
        // Si ce n'est pas du JSON, format simple
        return `🟢 **INFO** | \`${new Date().toLocaleString('fr-FR')}\`\n${log.trim()}\n${'─'.repeat(40)}`;
      }
    }

    // Formatage de la date
    const timestamp = new Date(log.timestamp || Date.now()).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      hour12: false,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Déterminer le type et l'emoji
    let typeEmoji, typeText;
    if (log.type === 'err' || (log.message && log.message.toLowerCase().includes('erreur'))) {
      typeEmoji = '🔴';
      typeText = 'ERREUR';
    } else if (log.type === 'warn' || (log.message && log.message.toLowerCase().includes('avertissement'))) {
      typeEmoji = '🟡';
      typeText = 'ATTENTION';
    } else {
      typeEmoji = '🟢';
      typeText = 'INFO';
    }

    // Nettoyer et formater le message
    let message = '';
    if (log.message) {
      message = typeof log.message === 'string' 
        ? log.message.replace(/\\n/g, '\n').trim()
        : JSON.stringify(log.message, null, 2);

      // Supprimer les timestamps redondants et autres métadonnées
      message = message.replace(/^\d{4}-\d{2}-\d{2}.*?\+\d{2}:\d{2}/, '').trim();
      message = message.replace(/^"/, '').replace(/"$/, '');
    }

    // Formater différemment selon le type de message
    let formattedMessage;
    if (message.toLowerCase().includes('prêt')) {
      formattedMessage = `${typeEmoji} **BOT ${message.toUpperCase()}** | \`${timestamp}\``;
    } else if (message.toLowerCase().includes('connecté')) {
      formattedMessage = `${typeEmoji} **CONNEXION RÉUSSIE** | \`${timestamp}\`\n📡 ${message}`;
    } else if (message.toLowerCase().includes('erreur')) {
      formattedMessage = `${typeEmoji} **${typeText}** | \`${timestamp}\`\n⚠️ ${message}`;
    } else {
      formattedMessage = `${typeEmoji} **${typeText}** | \`${timestamp}\`\n📝 ${message}`;
    }

    // Ajouter des informations de processus si disponibles
    if (log.app_name && log.process_id) {
      formattedMessage += `\n👾 \`${log.app_name}\` (PID: ${log.process_id})`;
    }

    return `${formattedMessage}\n${'─'.repeat(40)}`;

  } catch (error) {
    console.error('Erreur de formatage du log:', error);
    return `⚠️ **LOG NON FORMATÉ** | \`${new Date().toLocaleString('fr-FR')}\`\n${typeof log === 'object' ? JSON.stringify(log, null, 2) : String(log)}\n${'─'.repeat(40)}`;
  }
}

// Fonction pour envoyer les logs dans Discord
async function logToDiscord(log) {
  try {
    if (!log) return;

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      const formattedLog = formatPm2Log(log);
      
      // Limiter la taille des logs pour éviter l'erreur 50035
      const MAX_EMBED_DESCRIPTION = 4000; // Légèrement inférieur à la limite de 4096
      
      // Utiliser des embeds pour les erreurs
      if (log.type === 'err') {
        let description = formattedLog;
        
        // Tronquer la description si elle est trop longue
        if (description.length > MAX_EMBED_DESCRIPTION) {
          description = description.substring(0, MAX_EMBED_DESCRIPTION) + '... (tronqué)';
        }
        
        await logChannel.send({
          embeds: [{
            color: 0xFF0000, // Rouge pour les erreurs
            description: description,
            footer: {
              text: `Process: ${log.app_name || 'DiscordBot'} (PID: ${log.process_id || 0})`
            }
          }]
        }).catch(error => {
          console.error('Erreur lors de l\'envoi du log dans Discord:', error.code, error.message);
        });
    } else {
        // Pour les logs normaux, utiliser des messages texte simples
        // et les diviser si nécessaire
        if (formattedLog.length > 2000) {
          const parts = [];
          let remaining = formattedLog;
          
          while (remaining.length > 0) {
            const chunk = remaining.substring(0, 1900);
            const lastNewline = chunk.lastIndexOf('\n');
            
            if (lastNewline > 0) {
              parts.push(remaining.substring(0, lastNewline));
              remaining = remaining.substring(lastNewline + 1);
            } else {
              parts.push(chunk);
              remaining = remaining.substring(1900);
            }
          }
          
          for (const part of parts) {
            await logChannel.send(part).catch(error => {
              console.error('Erreur lors de l\'envoi du log dans Discord:', error.code, error.message);
            });
          }
        } else {
          await logChannel.send(formattedLog).catch(error => {
            console.error('Erreur lors de l\'envoi du log dans Discord:', error.code, error.message);
          });
        }
      }
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
  console.log(`Bot démarré en tant que ${client.user.tag}`);
  
  // Attendre un court instant avant de définir l'activité pour éviter les erreurs de sharding
  setTimeout(async () => {
    try {
      // Définir l'activité du bot de manière sécurisée
      if (client.user) {
        await client.user.setActivity('qBittorrent', { type: 'WATCHING' });
        console.log('Activité du bot définie avec succès');
      }
    } catch (error) {
      console.error('Erreur lors de la définition de l\'activité:', error);
    }
    
    // Envoyer le message de démarrage après avoir défini l'activité
    try {
  await logToDiscord(`Bot démarré en tant que ${client.user.tag}`);
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message de démarrage:', error);
    }
  }, 5000); // Attendre 5 secondes
  
  // Se connecter à qBittorrent après l'initialisation du bot
  try {
    await loginToQBittorrent();
  console.log('Prêt !');
  } catch (error) {
    console.error('Erreur lors de la connexion à qBittorrent:', error);
  }
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

// Fonction pour gérer la reconnexion automatique
async function handleReconnection() {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const loggedIn = await loginToQBittorrent();
      if (loggedIn) {
        console.log('Reconnexion à qBittorrent réussie');
        return true;
      }
    } catch (error) {
      console.error(`Tentative de reconnexion ${retries + 1}/${maxRetries} échouée:`, error);
    }
    retries++;
    await new Promise(resolve => setTimeout(resolve, 5000 * retries)); // Délai croissant
  }
  return false;
}

// Fonction pour vérifier la validité de la session
async function checkSession() {
  try {
    const response = await axios.get(`${QBITTORRENT_HOST}/api/v2/app/version`, {
      headers: { 'Cookie': `SID=${SID}` }
    });
    return response.status === 200;
  } catch (error) {
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
  try {
    if (!SID || !(await checkSession())) {
      const reconnected = await handleReconnection();
      if (!reconnected) {
        throw new Error('Impossible de se reconnecter à qBittorrent');
      }
    }

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

// Map pour suivre l'état des torrents
const torrentStates = new Map();
// Map pour suivre les notifications de progression envoyées
const progressNotifications = new Map();
// File d'attente des torrents
const torrentQueue = [];
// Torrents actifs
const activeTorrents = new Set();
// Historique des données pour les graphiques
const torrentHistory = new Map();
// Limite de points d'historique par torrent
const MAX_HISTORY_POINTS = 20;
// Durée maximale de conservation des données d'historique (24 heures en ms)
const MAX_HISTORY_AGE = 24 * 60 * 60 * 1000;

// Fonction pour nettoyer les données anciennes
function cleanupOldData() {
  const now = Date.now();
  
  // Nettoyer l'historique des torrents
  for (const [hash, history] of torrentHistory.entries()) {
    // Supprimer les torrents qui n'ont pas été mis à jour depuis MAX_HISTORY_AGE
    if (history.lastUpdate && (now - history.lastUpdate > MAX_HISTORY_AGE)) {
      torrentHistory.delete(hash);
      continue;
    }
  }
  
  // Nettoyer les états des torrents qui n'existent plus
  getTorrentList().then(torrents => {
    if (!torrents) return;
    
    const activeHashes = new Set(torrents.map(t => t.hash));
    
    // Nettoyer les maps pour les torrents qui n'existent plus
    for (const hash of torrentStates.keys()) {
      if (!activeHashes.has(hash)) {
        torrentStates.delete(hash);
        progressNotifications.delete(hash);
        torrentHistory.delete(hash);
      }
    }
  }).catch(err => console.error('Erreur lors du nettoyage des données:', err));
}

// Appeler le nettoyage périodiquement
setInterval(cleanupOldData, 3600000); // Toutes les heures

// Fonction pour vérifier les torrents terminés et envoyer une notification
async function checkCompletedTorrents() {
  try {
    const torrents = await getTorrentList();
    if (!torrents) return;

    // Récupérer à la fois le canal de logs et le canal principal
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(error => {
      console.error(`Erreur lors de la récupération du canal de logs:`, error);
      return null;
    });
    
    // Trouver le canal principal où l'utilisateur interagit avec le bot
    // Utiliser le canal de logs comme fallback si le canal principal n'est pas trouvé
    const mainChannel = client.channels.cache.find(channel => 
      channel.type === 0 && // Type 0 = TextChannel
      channel.id !== LOG_CHANNEL_ID && 
      channel.permissionsFor(client.user).has('SendMessages')
    ) || logChannel;
    
    if (!mainChannel || !mainChannel.isTextBased()) {
      console.error('Aucun canal valide trouvé pour envoyer les notifications');
      return;
    }

    for (const torrent of torrents) {
      // Initialiser l'état du torrent s'il n'existe pas encore
      if (!torrentStates.has(torrent.hash)) {
        torrentStates.set(torrent.hash, torrent.progress);
        continue; // Passer au suivant car c'est la première fois qu'on le voit
      }

      const previousProgress = torrentStates.get(torrent.hash);
      
      // Un torrent est considéré comme nouvellement terminé si:
      // - Il avait un état précédent (pas nouveau)
      // - Son état précédent n'était pas 1 (100%)
      // - Son état actuel est 1 (100%)
      const isNewlyCompleted = previousProgress !== undefined && 
                               previousProgress < 1 && 
                               torrent.progress === 1;

      // Vérifier les notifications de progression
      if (config.bot.progressNotifications.enabled && 
          torrent.size >= config.bot.progressNotifications.minSize &&
          previousProgress !== undefined && 
          torrent.progress < 1) {
        
        // Vérifier chaque seuil de progression
        for (const threshold of config.bot.progressNotifications.thresholds) {
          const thresholdDecimal = threshold / 100;
          
          // Si le torrent a dépassé un seuil et qu'aucune notification n'a été envoyée pour ce seuil
          if (torrent.progress >= thresholdDecimal && 
              previousProgress < thresholdDecimal && 
              (!progressNotifications.has(torrent.hash) || 
               !progressNotifications.get(torrent.hash).includes(threshold))) {
            
            // Envoyer une notification de progression
            const progressMessage = {
              embeds: [{
                color: 0x0099FF,
                title: `📊 Progression: ${threshold}% atteint`,
                description: `Le torrent **${torrent.name}** a atteint ${threshold}% de progression`,
                fields: [
                  {
                    name: '📈 Détails',
                    value: `• Taille: ${formatSize(torrent.size)}
• Téléchargé: ${formatSize(torrent.downloaded)}
• Vitesse: ${formatSpeed(torrent.dlspeed)}
• ETA: ${torrent.eta > 0 ? `${Math.floor(torrent.eta / 3600)}h ${Math.floor((torrent.eta % 3600) / 60)}m` : 'Terminé'}`
                  }
                ],
                timestamp: new Date().toISOString()
              }]
            };

            // Envoyer au canal de logs
            if (logChannel) {
              await logChannel.send(progressMessage).catch(error => {
                console.error('Erreur lors de l\'envoi de la notification de progression:', error);
              });
            }
            
            // Enregistrer que cette notification a été envoyée
            if (!progressNotifications.has(torrent.hash)) {
              progressNotifications.set(torrent.hash, [threshold]);
            } else {
              progressNotifications.get(torrent.hash).push(threshold);
            }
          }
        }
      }

      // Si le torrent vient juste de se terminer et que les notifications sont activées
      if (isNewlyCompleted && config.bot.notifyOnComplete) {
        console.log(`Torrent terminé détecté: ${torrent.name}`);
        
        // Obtenir des informations supplémentaires sur le torrent
        let properties = {};
        try {
          const propertiesResponse = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/properties?hash=${torrent.hash}`, {
            headers: { 'Cookie': `SID=${SID}` }
          });
          properties = propertiesResponse.data;
        } catch (error) {
          console.error('Erreur lors de la récupération des propriétés du torrent:', error);
          properties = { time_elapsed: 0 };
        }
        
        // Créer le message de notification de téléchargement terminé
        const completionMessage = {
          content: `<@${DISCORD_USER_ID}> Votre téléchargement est terminé !`,
          embeds: [{
            color: 0x00FF00,
            title: '✅ Téléchargement Terminé !',
            description: `Le torrent **${torrent.name}** est terminé !`,
            fields: [
              {
                name: '📊 Informations',
                value: `• Taille: ${formatSize(torrent.size)}
• Ratio: ${torrent.ratio.toFixed(2)}
• Temps total: ${Math.floor(properties.time_elapsed / 3600)}h ${Math.floor((properties.time_elapsed % 3600) / 60)}m
• Vitesse moyenne: ${formatSpeed(torrent.size / (properties.time_elapsed || 1))}`
              },
              {
                name: '📁 Emplacement',
                value: `\`${config.bot.defaultSavePath}/${torrent.name}\``
              }
            ],
            timestamp: new Date().toISOString()
          }]
        };

        // Envoyer la notification au canal principal pour que l'utilisateur soit pingé
        await mainChannel.send(completionMessage).catch(error => {
          console.error('Erreur lors de l\'envoi de la notification de téléchargement terminé:', error);
        });
        
        // Également envoyer au canal de logs si différent du canal principal
        if (logChannel && logChannel.id !== mainChannel.id) {
          await logChannel.send(completionMessage).catch(error => {
            console.error('Erreur lors de l\'envoi de la notification de téléchargement terminé au canal de logs:', error);
          });
        }
        
        console.log(`Notification envoyée pour: ${torrent.name}`);
        
        // Supprimer les notifications de progression pour ce torrent
        progressNotifications.delete(torrent.hash);
        
        // Mettre à jour les torrents actifs
        activeTorrents.delete(torrent.hash);
        
        // Traiter la file d'attente
        processQueue();
      }

      // Mettre à jour l'état
      torrentStates.set(torrent.hash, torrent.progress);
    }
  } catch (error) {
    console.error('Erreur lors de la vérification des torrents terminés:', error);
  }
}

// Fonction pour gérer la file d'attente des torrents
async function processQueue() {
  try {
    // Vérifier si nous pouvons démarrer de nouveaux torrents
    while (activeTorrents.size < config.bot.maxConcurrentDownloads && torrentQueue.length > 0) {
      const nextTorrent = torrentQueue.shift();
      
      // Démarrer le torrent
      await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/resume`, 
        `hashes=${nextTorrent}`, {
          headers: { 'Cookie': `SID=${SID}` }
        });

      // Ajouter à la liste des torrents actifs
      activeTorrents.add(nextTorrent);
      
      console.log(`Démarrage du torrent ${nextTorrent} depuis la file d'attente`);
    }
  } catch (error) {
    console.error('Erreur lors du traitement de la file d\'attente:', error);
  }
}

// Fonction pour vérifier et gérer les limites de téléchargements simultanés
async function manageDownloadLimits() {
  try {
    const torrents = await getTorrentList();
    if (!torrents) return;
    
    // Réinitialiser la liste des torrents actifs
    activeTorrents.clear();
    torrentQueue.length = 0;
    
    // Identifier les torrents en cours de téléchargement
    const downloadingTorrents = torrents.filter(t => 
      t.state === 'downloading' || t.state === 'stalledDL' || t.state === 'metaDL'
    );
    
    // Si nous avons plus de torrents que la limite
    if (downloadingTorrents.length > config.bot.maxConcurrentDownloads) {
      // Trier par progression (priorité aux torrents les plus avancés)
      downloadingTorrents.sort((a, b) => b.progress - a.progress);
      
      // Les torrents à garder actifs
      const keepActive = downloadingTorrents.slice(0, config.bot.maxConcurrentDownloads);
      
      // Les torrents à mettre en pause
      const pauseTorrents = downloadingTorrents.slice(config.bot.maxConcurrentDownloads);
      
      // Mettre à jour les ensembles
      keepActive.forEach(t => activeTorrents.add(t.hash));
      
      // Mettre en pause les torrents excédentaires
      if (pauseTorrents.length > 0) {
        const pauseHashes = pauseTorrents.map(t => t.hash).join('|');
        await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/pause`, 
          `hashes=${pauseHashes}`, {
          headers: { 'Cookie': `SID=${SID}` }
        });
        
        // Ajouter à la file d'attente
        pauseTorrents.forEach(t => torrentQueue.push(t.hash));
        
        console.log(`${pauseTorrents.length} torrents mis en file d'attente pour respecter la limite de ${config.bot.maxConcurrentDownloads}`);
      }
    } else {
      // Tous les torrents en téléchargement sont actifs
      downloadingTorrents.forEach(t => activeTorrents.add(t.hash));
    }
  } catch (error) {
    console.error('Erreur lors de la gestion des limites de téléchargement:', error);
  }
}

// Fonction pour vérifier l'espace disque disponible
async function checkDiskSpace() {
  try {
    if (!config.bot.diskSpace.enabled) return;
    
    // Exécuter la commande df pour obtenir l'espace disque
    const { stdout } = await new Promise((resolve, reject) => {
      exec(`df -h ${config.bot.defaultSavePath}`, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout, stderr });
      });
    });
    
    // Analyser la sortie pour obtenir le pourcentage d'utilisation
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) throw new Error('Format de sortie df inattendu');
    
    const diskInfo = lines[1].split(/\s+/);
    const usagePercent = parseInt(diskInfo[4].replace('%', ''));
    
    // Vérifier si l'utilisation dépasse le seuil d'avertissement
    if (usagePercent >= config.bot.diskSpace.warnThreshold) {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel && logChannel.isTextBased()) {
        await logChannel.send({
          embeds: [{
            color: 0xFF0000,
            title: '⚠️ Alerte Espace Disque',
            description: `L'espace disque utilisé a atteint **${usagePercent}%** (seuil: ${config.bot.diskSpace.warnThreshold}%)`,
            fields: [
              {
                name: '💾 Informations Disque',
                value: `• Chemin: ${config.bot.defaultSavePath}
• Taille: ${diskInfo[1]}
• Utilisé: ${diskInfo[2]} (${usagePercent}%)
• Disponible: ${diskInfo[3]}`
              }
            ],
            timestamp: new Date().toISOString()
          }]
        });
      }
    }
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'espace disque:', error);
  }
}

// Fonction pour mettre à jour automatiquement les vues détaillées
async function updateDetailedViews() {
  try {
    if (!config.bot.detailedView.enabled) {
      console.log('Mise à jour des vues détaillées désactivée');
      return;
    }
    
    console.log('Mise à jour des vues détaillées...');
    
    // Pour chaque message de vue détaillée
    for (const [hash, messageInfo] of detailedViewMessages.entries()) {
      // Vérifier si le message est encore valide (moins de 10 minutes)
      const messageAge = Date.now() - messageInfo.timestamp;
      if (messageAge > 600000) { // 10 minutes
        console.log(`Message trop ancien pour ${hash}, suppression de la référence`);
        detailedViewMessages.delete(hash);
        continue;
      }
      
      // Récupérer le torrent
      const torrents = await getTorrentList();
      if (!torrents) {
        console.error('Impossible de récupérer la liste des torrents pour la mise à jour des vues détaillées');
        continue;
      }
      
      const torrent = torrents.find(t => t.hash === hash);
      
      if (torrent) {
        // Générer la vue détaillée mise à jour
        const detailedView = await getDetailedTorrentView(torrent);
        
        if (detailedView && detailedView.embeds) {
          try {
            // Récupérer le message
            const channel = await client.channels.fetch(messageInfo.channelId).catch(error => {
              console.error(`Erreur lors de la récupération du canal ${messageInfo.channelId}:`, error);
              return null;
            });
            
            if (!channel) {
              console.error(`Canal ${messageInfo.channelId} non trouvé, suppression de la référence`);
              detailedViewMessages.delete(hash);
              continue;
            }
            
            const message = await channel.messages.fetch(messageInfo.messageId).catch(error => {
              console.error(`Erreur lors de la récupération du message ${messageInfo.messageId}:`, error);
              return null;
            });
            
            if (!message) {
              console.error(`Message ${messageInfo.messageId} non trouvé, suppression de la référence`);
              detailedViewMessages.delete(hash);
              continue;
            }
            
            // Mettre à jour le message
            await message.edit({ embeds: detailedView.embeds }).catch(error => {
              console.error(`Erreur lors de la mise à jour du message ${messageInfo.messageId}:`, error);
              if (error.code === 10008) { // Message inconnu
                detailedViewMessages.delete(hash);
              }
            });
            
            console.log(`Vue détaillée mise à jour pour ${torrent.name}`);
          } catch (error) {
            // Le message n'existe plus ou n'est pas accessible
            console.error(`Erreur lors de la mise à jour du message:`, error);
            detailedViewMessages.delete(hash);
          }
        }
      } else {
        // Le torrent n'existe plus
        console.log(`Torrent ${hash} non trouvé, suppression de la référence`);
        detailedViewMessages.delete(hash);
      }
    }
  } catch (error) {
    console.error('Erreur lors de la mise à jour des vues détaillées:', error);
  }
}

// Fonction pour générer le résumé quotidien
async function generateDailySummary() {
  try {
    if (!config.bot.dailySummary.enabled) {
      console.log('Résumé quotidien désactivé');
      return;
    }
    
    const now = new Date();
    const [hour, minute] = config.bot.dailySummary.time.split(':').map(Number);
    
    // Vérifier si c'est l'heure du résumé (à 1 minute près)
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    console.log(`Vérification du résumé quotidien: ${currentHour}:${currentMinute} vs ${hour}:${minute}`);
    
    if (currentHour === hour && Math.abs(currentMinute - minute) <= 1) {
      console.log('Génération du résumé quotidien...');
      
      const torrents = await getTorrentList();
      if (!torrents) {
        console.error('Impossible de récupérer la liste des torrents pour le résumé quotidien');
        return;
      }
      
      // Statistiques
      const stats = {
        total: torrents.length,
        active: torrents.filter(t => t.state === 'downloading' || t.state === 'uploading').length,
        completed: torrents.filter(t => t.progress === 1).length,
        paused: torrents.filter(t => t.state === 'pausedDL' || t.state === 'pausedUP').length,
        totalSize: torrents.reduce((acc, t) => acc + t.size, 0),
        downloadedToday: 0, // À calculer
        uploadedToday: 0,   // À calculer
        completedToday: []  // Liste des torrents terminés aujourd'hui
      };
      
      // Identifier les torrents terminés aujourd'hui
      const today = new Date().setHours(0, 0, 0, 0);
      for (const torrent of torrents) {
        if (torrent.completion_on && torrent.completion_on * 1000 >= today) {
          stats.completedToday.push(torrent);
        }
      }
      
      // Récupérer les statistiques de transfert
      try {
        const transferStats = await axios.get(`${QBITTORRENT_HOST}/api/v2/transfer/info`, {
                headers: { 'Cookie': `SID=${SID}` }
              });

        if (transferStats.status === 200) {
          stats.downloadedToday = transferStats.data.dl_info_data || 0;
          stats.uploadedToday = transferStats.data.up_info_data || 0;
        }
            } catch (error) {
        console.error('Erreur lors de la récupération des statistiques de transfert:', error);
      }
      
      // Générer le message de résumé
      const summaryEmbed = {
        color: 0x0099FF,
        title: '📊 Résumé Quotidien des Torrents',
        description: `Voici le résumé de l'activité torrent pour le ${now.toLocaleDateString('fr-FR')}`,
        fields: [
          {
            name: '📈 Statistiques Générales',
            value: `• Torrents totaux: ${stats.total}
• Actifs: ${stats.active}
• Complétés: ${stats.completed}
• En pause: ${stats.paused}
• Taille totale: ${formatSize(stats.totalSize)}`
          },
          {
            name: '🔄 Transfert Aujourd\'hui',
            value: `• Téléchargé: ${formatSize(stats.downloadedToday)}
• Uploadé: ${formatSize(stats.uploadedToday)}
• Ratio: ${stats.downloadedToday > 0 ? (stats.uploadedToday / stats.downloadedToday).toFixed(2) : '∞'}`
          }
        ],
        timestamp: new Date().toISOString()
      };
      
      // Ajouter les torrents terminés aujourd'hui
      if (stats.completedToday.length > 0) {
        const completedList = stats.completedToday
          .map(t => `• ${t.name} (${formatSize(t.size)})`)
          .join('\n');
        
        summaryEmbed.fields.push({
          name: `✅ Torrents Terminés Aujourd'hui (${stats.completedToday.length})`,
          value: completedList.length > 1024 ? completedList.substring(0, 1021) + '...' : completedList
        });
      }
      
      // Envoyer le résumé
      try {
        // Utiliser le LOG_CHANNEL_ID si channelId est "LOG_CHANNEL_ID"
        let channelId = config.bot.dailySummary.channelId;
        if (channelId === "LOG_CHANNEL_ID") {
          channelId = LOG_CHANNEL_ID;
          console.log(`Utilisation de LOG_CHANNEL_ID (${LOG_CHANNEL_ID}) pour le résumé quotidien`);
        }
        
        if (!channelId || channelId === "LOG_CHANNEL_ID") {
          console.error('ID de canal non valide pour le résumé quotidien');
          return;
        }
        
        console.log(`Tentative d'envoi du résumé quotidien au canal ${channelId}`);
        const logChannel = await client.channels.fetch(channelId);
        
        if (logChannel && logChannel.isTextBased()) {
          await logChannel.send({ embeds: [summaryEmbed] });
          console.log('Résumé quotidien envoyé avec succès');
        } else {
          console.error('Canal de résumé quotidien non trouvé ou non textuel');
        }
      } catch (error) {
        console.error('Erreur lors de l\'envoi du résumé quotidien:', error);
      }
    }
  } catch (error) {
    console.error('Erreur lors de la génération du résumé quotidien:', error);
  }
}

// Optimisation des intervalles en regroupant les tâches périodiques
function runScheduledTasks() {
  // Obtenir l'heure actuelle
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  
  // Tâches à exécuter toutes les 30 secondes
  if (seconds % 30 === 0) {
    console.log('Exécution des tâches toutes les 30 secondes...');
    checkCompletedTorrents(); // Vérification des torrents terminés reste à 30 secondes pour les notifications rapides
  }
  
  // Tâches à exécuter toutes les 2 minutes
  if (minutes % 2 === 0 && seconds === 0) {
    console.log('Exécution des tâches toutes les 2 minutes...');
    updateDetailedViews(); // Mise à jour des vues détaillées toutes les 2 minutes
  }
  
  // Tâches à exécuter toutes les minutes
  if (seconds === 0) {
    console.log('Exécution des tâches toutes les minutes...');
    manageDownloadLimits();
    generateDailySummary();
  }
  
  // Tâches à exécuter toutes les 5 minutes
  if (minutes % 5 === 0 && seconds === 0) {
    console.log('Exécution des tâches toutes les 5 minutes...');
    checkSession().then(valid => {
      if (!valid) {
        console.log('Session expirée, reconnexion...');
        loginToQBittorrent();
      }
    });
  }
  
  // Tâches à exécuter toutes les heures
  if (minutes === 0 && seconds === 0) {
    console.log('Exécution des tâches toutes les heures...');
    checkDiskSpace();
    cleanupOldData();
  }
}

// Remplacer tous les intervalles par un seul intervalle optimisé
const mainInterval = setInterval(runScheduledTasks, 1000);

// Mise à jour de la gestion des interactions pour utiliser la nouvelle méthode registerMessage
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const [action, hash] = interaction.customId.split('_');
  
  try {
    switch (action) {
      case 'pause':
        await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/pause`, `hashes=${hash}`, {
          headers: { 'Cookie': `SID=${SID}` }
        });
        await interaction.reply('⏸️ Torrent mis en pause');
        break;

      case 'resume':
        await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/resume`, `hashes=${hash}`, {
          headers: { 'Cookie': `SID=${SID}` }
        });
        await interaction.reply('▶️ Torrent repris');
        break;

      case 'force':
        await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/setForceStart`, `hashes=${hash}&value=true`, {
          headers: { 'Cookie': `SID=${SID}` }
        });
        await interaction.reply('⏩ Démarrage forcé activé');
        break;

      case 'delete':
        // Créer un message de confirmation
        const confirm = new ButtonBuilder()
          .setCustomId(`confirm_delete_${hash}`)
          .setLabel('Confirmer')
          .setStyle(ButtonStyle.Danger);

        const cancel = new ButtonBuilder()
          .setCustomId(`cancel_delete_${hash}`)
          .setLabel('Annuler')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirm, cancel);

        await interaction.reply({
          content: '⚠️ Êtes-vous sûr de vouloir supprimer ce torrent ?',
          components: [row]
        });
        break;

      case 'confirm_delete':
        await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/delete`, `hashes=${hash}&deleteFiles=false`, {
          headers: { 'Cookie': `SID=${SID}` }
        });
        await interaction.reply('🗑️ Torrent supprimé');
        break;

      case 'cancel_delete':
        await interaction.reply('❌ Suppression annulée');
        break;
    }

    // Mettre à jour la vue détaillée après l'action
    if (action !== 'cancel_delete') {
      try {
        const torrents = await getTorrentList();
        const torrent = torrents.find(t => t.hash === hash);
        if (torrent) {
          const detailedView = await getDetailedTorrentView(torrent);
          if (detailedView) {
            const reply = await interaction.followUp(detailedView).catch(err => {
              console.error('Erreur lors de l\'envoi de la vue détaillée:', err.message);
              return null;
            });
            
            // Utiliser la nouvelle méthode registerMessage si la réponse a été envoyée
            if (reply && detailedView.registerMessage && typeof detailedView.registerMessage === 'function') {
              detailedView.registerMessage(reply);
            }
          }
        }
      } catch (error) {
        console.error('Erreur lors de la mise à jour de la vue détaillée:', error);
      }
    }
  } catch (error) {
    console.error('Erreur lors de l\'action sur le torrent:', error);
    // Utiliser ephemeral pour éviter de polluer le canal
    await interaction.reply({
      content: '❌ Une erreur est survenue lors de l\'exécution de l\'action',
      ephemeral: true
    }).catch(err => {
      console.error('Erreur lors de la réponse à l\'interaction:', err);
    });
  }
});

// Fonction pour renommer un torrent
async function renameTorrent(hash, newName) {
  try {
    if (!SID || !(await checkSession())) {
      const reconnected = await handleReconnection();
      if (!reconnected) {
        throw new Error('Impossible de se reconnecter à qBittorrent');
      }
    }

    await axios.post(
      `${QBITTORRENT_HOST}/api/v2/torrents/rename`,
      `hash=${hash}&name=${encodeURIComponent(newName)}`,
      {
        headers: {
          'Cookie': `SID=${SID}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return true;
  } catch (error) {
    console.error('Erreur lors du renommage du torrent:', error);
    return false;
  }
}

// Fonction pour mettre à jour l'historique des torrents
function updateTorrentHistory(torrent) {
  if (!torrentHistory.has(torrent.hash)) {
    torrentHistory.set(torrent.hash, {
      progress: [],
      speed: [],
      peers: [],
      lastUpdate: Date.now()
    });
  }

  const history = torrentHistory.get(torrent.hash);
  const now = new Date().toLocaleTimeString('fr-FR');

  // Mettre à jour le timestamp
  history.lastUpdate = Date.now();

  // Limiter l'historique à MAX_HISTORY_POINTS points
  if (history.progress.length >= MAX_HISTORY_POINTS) {
    history.progress.shift();
    history.speed.shift();
    history.peers.shift();
  }

  // Ajouter les nouvelles données
  history.progress.push({ time: now, value: torrent.progress * 100 });
  history.speed.push({ time: now, value: torrent.dlspeed / 1024 }); // KB/s
  history.peers.push({ time: now, value: torrent.num_leechs + torrent.num_seeds });
}

// Fonction pour générer un graphique
async function generateChart(data, label, color) {
  if (!data || data.length === 0) {
    console.log('Pas de données pour générer le graphique');
    // Retourner une URL d'image par défaut si pas de données
    return 'https://quickchart.io/chart?c={type:%27line%27,data:{labels:[%27Pas%20de%20données%27],datasets:[{label:%27Pas%20de%20données%27,data:[0],borderColor:%27%23cccccc%27}]}}';
  }
  
  try {
    console.log(`Génération d'un graphique pour ${label} avec ${data.length} points`);
    const chart = new QuickChart();
    
    // Limiter le nombre de points pour éviter les erreurs d'URL trop longue
    const maxPoints = 15;
    let chartData = data;
    
    if (data.length > maxPoints) {
      // Prendre les points les plus récents
      chartData = data.slice(-maxPoints);
    }
    
    const labels = chartData.map(point => point.time);
    const values = chartData.map(point => point.value);
    
    console.log('Données du graphique:', { labels, values });
    
    chart.setConfig({
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: values,
          fill: false,
          borderColor: color,
          tension: 0.1
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
    
    chart.setWidth(500);
    chart.setHeight(300);
    chart.setBackgroundColor('white');
    
    const url = chart.getUrl();
    console.log(`URL du graphique générée: ${url.substring(0, 100)}...`);
    return url;
    } catch (error) {
    console.error('Erreur lors de la génération du graphique:', error);
    return 'https://quickchart.io/chart?c={type:%27line%27,data:{labels:[%27Erreur%27],datasets:[{label:%27Erreur%27,data:[0],borderColor:%27%23ff0000%27}]}}';
  }
}

// Fonction pour obtenir la vue détaillée d'un torrent
async function getDetailedTorrentView(torrent) {
  try {
    console.log(`Génération de la vue détaillée pour ${torrent.name}`);
    
    // Récupérer les propriétés du torrent
    const properties = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/properties?hash=${torrent.hash}`, {
      headers: { 'Cookie': `SID=${SID}` }
    });

    // Mettre à jour l'historique du torrent
    updateTorrentHistory(torrent);
    const history = torrentHistory.get(torrent.hash);

    console.log(`Historique récupéré pour ${torrent.hash}: ${history.progress.length} points`);

    // Générer les graphiques (seulement progression et vitesse)
    const progressChart = await generateChart(
      history.progress,
      'Progression',
      config.bot.detailedView.graphColors.progress
    );
    
    const speedChart = await generateChart(
      history.speed,
      'Vitesse (KB/s)',
      config.bot.detailedView.graphColors.speed
    );
    
    // Vérifier et définir des valeurs par défaut pour les propriétés qui pourraient être undefined
    const seeds = properties.data.seeds !== undefined ? properties.data.seeds : 0;
    const peers = properties.data.peers !== undefined ? properties.data.peers : 0;
    const availability = properties.data.availability !== undefined ? properties.data.availability.toFixed(2) : '0.00';
    const time_elapsed = properties.data.time_elapsed !== undefined ? properties.data.time_elapsed : 0;

    // Créer les embeds
    const embeds = [
      new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`📦 ${torrent.name.substring(0, 250)}`) // Limiter la longueur du titre
        .addFields(
          { name: '📊 Progression', value: `• État: ${torrent.state}\n• Progression: ${(torrent.progress * 100).toFixed(1)}%\n• Taille: ${formatSize(torrent.size)}` },
          { name: '🔄 Transfert', value: `• ⬇️ ${formatSpeed(torrent.dlspeed)}\n• ⬆️ ${formatSpeed(torrent.upspeed)}\n• Ratio: ${torrent.ratio.toFixed(2)}` },
          { name: '⚡ Connexions', value: `• Seeds: ${seeds}\n• Peers: ${peers}\n• Disponibilité: ${availability}` },
          { name: '⏱️ Temps', value: `• Temps écoulé: ${Math.floor(time_elapsed / 3600)}h ${Math.floor((time_elapsed % 3600) / 60)}m\n• ETA: ${torrent.eta > 0 ? `${Math.floor(torrent.eta / 3600)}h ${Math.floor((torrent.eta % 3600) / 60)}m` : 'Terminé'}` }
        )
        .setTimestamp()
    ];

    // Ajouter les graphiques
    if (progressChart) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('📈 Graphique de progression')
          .setImage(progressChart)
          .addFields(
            { name: 'Progression', value: 'Evolution de la progression dans le temps' }
          )
      );
    }

    if (speedChart) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('📈 Graphique de vitesse')
          .setImage(speedChart)
          .addFields(
            { name: 'Vitesse', value: 'Evolution de la vitesse de téléchargement' }
          )
      );
    }

    if (peersChart) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0xFF9900)
          .setTitle('📈 Graphique de peers')
          .setImage(peersChart)
          .addFields(
            { name: 'Peers', value: 'Evolution du nombre de peers' }
          )
      );
    }

    // Ajouter les fichiers si activé
    if (config.bot.detailedView.showFiles) {
      const files = await getTorrentFiles(torrent.hash);
      if (files && files.length > 0) {
        // Limiter le nombre de fichiers et la longueur des noms
        const filesList = files
          .slice(0, 10) // Limiter à 10 fichiers pour éviter les messages trop longs
          .map(f => {
            const fileName = f.name.length > 40 ? f.name.substring(0, 37) + '...' : f.name;
            return `• ${fileName} (${formatSize(f.size)}) - ${(f.progress * 100).toFixed(1)}%`;
          })
          .join('\n');

        embeds.push(
          new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('📁 Fichiers')
            .setDescription(files.length > 10 ? `${filesList}\n... et ${files.length - 10} autres fichiers` : filesList)
        );
      }
    }

    // Ajouter les trackers si activé
    if (config.bot.detailedView.showTrackers) {
      const trackers = await getTorrentTrackers(torrent.hash);
      if (trackers && trackers.length > 0) {
        // Limiter le nombre de trackers et la longueur des URLs
        const trackersList = trackers
          .filter(t => t.status !== 0)
          .slice(0, 10)
          .map(t => {
            const trackerUrl = t.url.split('/')[2] || 'tracker';
            return `• ${trackerUrl.substring(0, 40)} - ${t.status === 1 ? '✅' : '❌'}`;
          })
          .join('\n');

        embeds.push(
          new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🌐 Trackers')
            .setDescription(trackersList || 'Aucun tracker actif')
        );
      }
    }

    console.log(`Vue détaillée générée avec ${embeds.length} embeds`);

    // Créer un objet de retour sans référence circulaire
    const messageData = { embeds };
    
    // Stocker l'ID du hash pour pouvoir l'utiliser dans le callback
    const torrentHash = torrent.hash;
    
    // Ajouter une méthode pour enregistrer le message
    messageData.registerMessage = function(message) {
      if (config.bot.detailedView.enabled && message && message.id) {
        console.log(`Enregistrement du message ${message.id} pour le torrent ${torrentHash}`);
        detailedViewMessages.set(torrentHash, {
          messageId: message.id,
          channelId: message.channel.id,
          timestamp: Date.now()
        });
      }
    };

    return messageData;
  } catch (error) {
    console.error('Erreur lors de la récupération des détails:', error);
    return null;
  }
}

// Optimisation de la gestion des erreurs
process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesse non gérée rejetée:', reason);
  
  // Éviter les erreurs circulaires en vérifiant si la raison est liée au sharding
  if (reason instanceof Error && !reason.message.includes('Shard')) {
    logToDiscord(`⚠️ Erreur non gérée: ${reason}`).catch(console.error);
  } else {
    console.error('Erreur de sharding détectée, ignorée pour éviter les boucles');
  }
});

process.on('uncaughtException', (error) => {
  console.error('Exception non capturée:', error);
  
  // Éviter les erreurs circulaires en vérifiant si l'erreur est liée au sharding
  if (!error.message.includes('Shard')) {
    logToDiscord(`🔴 Exception critique: ${error.message}`).catch(console.error);
    // Donner le temps d'envoyer le log avant de quitter
    setTimeout(() => process.exit(1), 1000);
  } else {
    console.error('Erreur de sharding détectée, ignorée pour éviter les boucles');
  }
});

// Fonction pour gérer la déconnexion propre
function handleGracefulShutdown() {
  console.log('Arrêt du bot en cours...');
  logToDiscord('Bot en cours d\'arrêt...').then(() => {
    client.destroy();
    process.exit(0);
  }).catch(() => process.exit(0));
}

// Écouter les signaux d'arrêt
process.on('SIGINT', handleGracefulShutdown);
process.on('SIGTERM', handleGracefulShutdown);

// Connexion avec gestion des erreurs
client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
  console.error('Erreur de connexion Discord:', error);
  
  // Tentative de reconnexion après un délai
  setTimeout(() => {
    console.log('Tentative de reconnexion...');
    client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
      console.error('Échec de la reconnexion:', err);
      process.exit(1); // Quitter si la reconnexion échoue
    });
  }, 10000); // Attendre 10 secondes avant de réessayer
});

// Événements sur les messages
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Vérifiez que l'utilisateur a les permissions nécessaires
  if (message.author.id !== DISCORD_USER_ID) {
    return message.channel.send('❌ Vous n\'avez pas la permission d\'exécuter cette commande.');
  }

  await logToDiscord(`Message reçu de ${message.author.tag}: ${message.content}`);

  // Vérifier si le message contient des pièces jointes .torrent
  if (message.attachments.size > 0) {
    const torrentAttachments = message.attachments.filter(attachment => 
      attachment.name.endsWith('.torrent') || 
      attachment.contentType === 'application/x-bittorrent'
    );
    
    if (torrentAttachments.size > 0) {
      console.log(`${torrentAttachments.size} fichier(s) torrent détecté(s)`);
      
      // Pour chaque fichier torrent
      for (const [id, attachment] of torrentAttachments) {
        try {
          // Créer un embed avec les informations du fichier
          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📥 Fichier Torrent Détecté')
            .setDescription(`Voulez-vous ajouter ce torrent à qBittorrent?`)
            .addFields(
              { name: '📁 Nom du fichier', value: attachment.name },
              { name: '📊 Taille', value: formatSize(attachment.size) },
              { name: '🔗 URL', value: attachment.url }
            )
            .setFooter({ text: 'Répondez avec ✅ pour confirmer ou ❌ pour annuler' })
            .setTimestamp();
          
          // Envoyer l'embed et attendre la confirmation
          const confirmMessage = await message.channel.send({ embeds: [embed] });
          
          // Ajouter les réactions
          await confirmMessage.react('✅');
          await confirmMessage.react('❌');
          
          // Créer un collecteur de réactions
          const filter = (reaction, user) => {
            return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
          };
          
          const collector = confirmMessage.createReactionCollector({ filter, time: 60000 });
          
          collector.on('collect', async (reaction, user) => {
            if (reaction.emoji.name === '✅') {
              // Confirmation reçue, ajouter le torrent
              await confirmMessage.edit({ 
                embeds: [
                  EmbedBuilder.from(embed)
                    .setColor(0x00FF00)
                    .setFooter({ text: 'Ajout du torrent en cours...' })
                ] 
              });
              
              // Vérifier la connexion à qBittorrent
              if (!SID || !(await checkSession())) {
                const loggedIn = await loginToQBittorrent();
                if (!loggedIn) {
                  await confirmMessage.edit({ 
                    embeds: [
                      EmbedBuilder.from(embed)
                        .setColor(0xFF0000)
                        .setFooter({ text: 'Échec de connexion à qBittorrent' })
                    ] 
                  });
                  return;
                }
              }
              
              // Ajouter le torrent
              try {
                // Télécharger le fichier .torrent
                const torrentFile = await axios.get(attachment.url, {
          responseType: 'arraybuffer',
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });

                // Créer le FormData pour qBittorrent
        const form = new FormData();
                form.append('torrents', torrentFile.data, {
                  filename: attachment.name,
                  contentType: 'application/x-bittorrent',
                  knownLength: torrentFile.data.length
                });
                
                // Ajouter le chemin de sauvegarde si configuré
                if (config.bot.defaultSavePath) {
                  form.append('savepath', config.bot.defaultSavePath);
                }
                
                // Préparer les headers
                const headers = {
                  'Cookie': `SID=${SID}`,
                  'Content-Type': `multipart/form-data; boundary=${form.getBoundary()}`,
                  'User-Agent': 'Mozilla/5.0',
                  'Content-Length': form.getLengthSync()
                };
                
                // Envoyer la requête
                const response = await axios.post(
                  `${QBITTORRENT_HOST}/api/v2/torrents/add`,
                  form.getBuffer(),
                  { headers }
                );
                
                if (response.status === 200) {
                  // Succès
                  await confirmMessage.edit({ 
                    embeds: [
                      EmbedBuilder.from(embed)
                        .setColor(0x00FF00)
                        .setFooter({ text: '✅ Torrent ajouté avec succès!' })
                    ] 
                  });
                  
                  // Attendre un peu pour que qBittorrent traite le torrent
        await new Promise(resolve => setTimeout(resolve, 2000));

                  // Récupérer la liste des torrents pour trouver celui qu'on vient d'ajouter
                  const torrents = await getTorrentList();
                  if (torrents && torrents.length > 0) {
                    // Trouver le torrent le plus récemment ajouté
                    const newestTorrent = torrents.reduce((newest, current) => {
                      return (!newest || current.added_on > newest.added_on) ? current : newest;
                    }, null);
                    
                    if (newestTorrent) {
                      // Afficher les détails du torrent ajouté
                      const detailedView = await getDetailedTorrentView(newestTorrent);
                      if (detailedView && detailedView.embeds) {
                        const reply = await message.channel.send({ 
                          content: '📊 Détails du torrent ajouté:',
                          embeds: detailedView.embeds 
                        });
                        
                        // Enregistrer le message pour les mises à jour automatiques
                        if (detailedView.registerMessage && typeof detailedView.registerMessage === 'function') {
                          detailedView.registerMessage(reply);
                        }
                      }
                    }
                  }
                } else {
                  // Échec
                  await confirmMessage.edit({ 
                    embeds: [
                      EmbedBuilder.from(embed)
                        .setColor(0xFF0000)
                        .setFooter({ text: '❌ Échec de l\'ajout du torrent' })
                    ] 
                  });
                }
              } catch (error) {
                console.error('Erreur lors de l\'ajout du torrent:', error);
                await confirmMessage.edit({ 
                  embeds: [
                    EmbedBuilder.from(embed)
                      .setColor(0xFF0000)
                      .setFooter({ text: `❌ Erreur: ${error.message}` })
                  ] 
                });
              }
            } else if (reaction.emoji.name === '❌') {
              // Annulation
              await confirmMessage.edit({ 
                embeds: [
                  EmbedBuilder.from(embed)
                    .setColor(0xFF0000)
                    .setFooter({ text: 'Ajout du torrent annulé' })
                ] 
              });
            }
            
            // Arrêter le collecteur
            collector.stop();
          });
          
          collector.on('end', collected => {
            if (collected.size === 0) {
              // Aucune réaction collectée (timeout)
              confirmMessage.edit({ 
                embeds: [
                  EmbedBuilder.from(embed)
                    .setColor(0xFF0000)
                    .setFooter({ text: 'Délai d\'attente expiré' })
                ] 
              }).catch(console.error);
            }
            
            // Supprimer les réactions
            confirmMessage.reactions.removeAll().catch(console.error);
          });
        } catch (error) {
          console.error('Erreur lors du traitement du fichier torrent:', error);
          await message.reply(`❌ Erreur lors du traitement du fichier torrent: ${error.message}`);
        }
      }
      
      return; // Ne pas traiter les autres commandes
    }
  }

  // Commande !statustorrent
  if (message.content.startsWith('!statustorrent')) {
    try {
      console.log('Commande !statustorrent reçue');
      
      // Vérifier la connexion
      if (!SID || !(await checkSession())) {
        const loggedIn = await loginToQBittorrent();
        if (!loggedIn) {
          await message.reply('❌ Connexion à qBittorrent échouée');
          return;
        }
      }

      // Récupérer les infos des torrents
      const response = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/info`, {
          headers: { 'Cookie': `SID=${SID}` }
        });

      if (response.status === 200 && response.data.length > 0) {
        console.log(`${response.data.length} torrents trouvés`);
        
        // Créer un collecteur global pour nettoyer tous les collecteurs à la fin
        const allCollectors = [];

        // Trier les torrents par état et progression
        const torrents = response.data.sort((a, b) => {
          // D'abord par état (téléchargement > upload > autres)
          const stateOrder = {
            'downloading': 0,
            'stalledDL': 1,
            'metaDL': 2,
            'uploading': 3,
            'stalledUP': 4,
            'pausedDL': 5,
            'pausedUP': 6,
            'queuedDL': 7,
            'queuedUP': 8,
            'error': 9,
            'missingFiles': 10,
            'unknown': 11
          };
          
          const stateCompare = (stateOrder[a.state] || 99) - (stateOrder[b.state] || 99);
          
          // Si même état, trier par progression (décroissant)
          if (stateCompare === 0) {
            return b.progress - a.progress;
          }
          
          return stateCompare;
        });

        for (const torrent of torrents) {
          // Déterminer la couleur en fonction de l'état
          let color;
          let stateEmoji;
          let stateText;
          
          if (torrent.state.includes('downloading')) {
            color = 0x3498DB; // Bleu
            stateEmoji = '⬇️';
            stateText = 'Téléchargement';
          } else if (torrent.state.includes('uploading')) {
            color = 0x2ECC71; // Vert
            stateEmoji = '⬆️';
            stateText = 'Upload';
          } else if (torrent.progress === 1) {
            color = 0x27AE60; // Vert foncé
            stateEmoji = '✅';
            stateText = 'Terminé';
          } else if (torrent.state.includes('paused')) {
            color = 0xE67E22; // Orange
            stateEmoji = '⏸️';
            stateText = 'En pause';
          } else if (torrent.state.includes('queued')) {
            color = 0xF1C40F; // Jaune
            stateEmoji = '⏳';
            stateText = 'En attente';
          } else if (torrent.state.includes('error')) {
            color = 0xE74C3C; // Rouge
            stateEmoji = '❌';
            stateText = 'Erreur';
          } else {
            color = 0x95A5A6; // Gris
            stateEmoji = '❓';
            stateText = torrent.state;
          }
          
          // Créer une barre de progression
          const progressBar = createProgressBar(torrent.progress);
          
          // Calculer le temps restant
          let etaText;
          if (torrent.progress === 1) {
            etaText = 'Terminé';
          } else if (torrent.eta === 8640000) {
            etaText = '∞';
          } else if (torrent.eta > 0) {
            const hours = Math.floor(torrent.eta / 3600);
            const minutes = Math.floor((torrent.eta % 3600) / 60);
            etaText = `${hours}h ${minutes}m`;
          } else {
            etaText = 'Inconnu';
          }
          
          // Créer l'embed
          const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${stateEmoji} ${torrent.name.substring(0, 200)}${torrent.name.length > 200 ? '...' : ''}`)
            .setDescription(`**État**: ${stateText}\n**Progression**: ${progressBar} ${(torrent.progress * 100).toFixed(1)}%`)
            .addFields(
              { name: '📊 Informations', value: `• Taille: ${formatSize(torrent.size)}\n• Téléchargé: ${formatSize(torrent.completed)}\n• Ratio: ${torrent.ratio.toFixed(2)}`, inline: true },
              { name: '🔄 Vitesses', value: `• ⬇️ ${formatSpeed(torrent.dlspeed)}\n• ⬆️ ${formatSpeed(torrent.upspeed)}\n• ETA: ${etaText}`, inline: true }
            )
            .setFooter({ text: `Hash: ${torrent.hash.substring(0, 8)}...` })
            .setTimestamp();
          
          // Ajouter des informations supplémentaires si disponibles
          if (torrent.num_seeds !== undefined && torrent.num_leechs !== undefined) {
            embed.addFields({ 
              name: '👥 Connexions', 
              value: `• Seeds: ${torrent.num_seeds}\n• Peers: ${torrent.num_leechs}`, 
              inline: true 
            });
          }

          // Envoyer l'embed
          console.log(`Envoi de l'embed pour ${torrent.name}`);
          const sentMessage = await message.channel.send({ embeds: [embed] });

          // Ajouter les réactions pour les contrôles
          await sentMessage.react('▶️'); // Play
          await sentMessage.react('⏸️'); // Pause
          await sentMessage.react('⏩'); // Force Start
          await sentMessage.react('🔍'); // Détails
          await sentMessage.react('🗑️'); // Delete
          console.log(`Réactions ajoutées pour ${torrent.name}`);

          // Gestion des réactions
          const filter = (reaction, user) => {
            return ['▶️', '⏸️', '⏩', '🔍', '🗑️'].includes(reaction.emoji.name) &&
                   user.id === message.author.id;
          };

          const collector = sentMessage.createReactionCollector({ filter, time: 300000 }); // 5 minutes
          allCollectors.push(collector);
          console.log(`Collecteur créé pour ${torrent.name}`);

          // Nettoyer le collecteur à la fin
          collector.on('end', () => {
            // Supprimer les réactions si possible
            if (!sentMessage.deleted) {
              sentMessage.reactions.removeAll().catch(error => console.error('Impossible de supprimer les réactions:', error));
            }
          });

          collector.on('collect', async (reaction, user) => {
            try {
              console.log(`Réaction ${reaction.emoji.name} collectée pour ${torrent.name}`);
              
              // Supprimer la réaction de l'utilisateur pour une meilleure UX
              reaction.users.remove(user).catch(error => console.error('Impossible de supprimer la réaction:', error));
              
              switch (reaction.emoji.name) {
                case '▶️': 
                  await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/resume`, `hashes=${torrent.hash}`, {
                    headers: { 'Cookie': `SID=${SID}` }
                  });
                  await sentMessage.reply({ content: `✅ Torrent **${torrent.name}** repris`, ephemeral: true });
                  break;
                  
                case '⏸️': 
                  await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/pause`, `hashes=${torrent.hash}`, {
                    headers: { 'Cookie': `SID=${SID}` }
                  });
                  await sentMessage.reply({ content: `⏸️ Torrent **${torrent.name}** mis en pause`, ephemeral: true });
                  break;
                  
                case '⏩': 
                  await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/setForceStart`, `hashes=${torrent.hash}&value=true`, {
                    headers: { 'Cookie': `SID=${SID}` }
                  });
                  await sentMessage.reply({ content: `⏩ Démarrage forcé activé pour **${torrent.name}**`, ephemeral: true });
                  break;
                  
                case '🔍':
                  // Générer la vue détaillée
                  const detailedView = await getDetailedTorrentView(torrent);
                  if (detailedView && detailedView.embeds) {
                    const reply = await message.channel.send({ embeds: detailedView.embeds });
                    
                    // Enregistrer le message pour les mises à jour automatiques
                    if (detailedView.registerMessage && typeof detailedView.registerMessage === 'function') {
                      detailedView.registerMessage(reply);
                    }
                  } else {
                    await sentMessage.reply('❌ Erreur lors de la génération de la vue détaillée');
                  }
                  break;
                  
                case '🗑️': 
                  // Demander confirmation
                  const confirmMsg = await sentMessage.reply('⚠️ **Êtes-vous sûr de vouloir supprimer ce torrent ?** (Répondez "oui" pour confirmer)');
                  
                  // Créer un collecteur pour la confirmation
                  const confirmFilter = m => m.author.id === user.id && m.content.toLowerCase() === 'oui';
                  const confirmCollector = message.channel.createMessageCollector({ filter: confirmFilter, time: 30000, max: 1 });
                  
                  confirmCollector.on('collect', async () => {
                    await axios.post(`${QBITTORRENT_HOST}/api/v2/torrents/delete`, `hashes=${torrent.hash}&deleteFiles=false`, {
                headers: { 'Cookie': `SID=${SID}` }
              });
                    await sentMessage.reply('🗑️ Torrent supprimé');
                    
                    // Mettre à jour l'embed pour montrer que le torrent a été supprimé
                    const updatedEmbed = EmbedBuilder.from(sentMessage.embeds[0])
                      .setColor(0xFF0000)
                      .setDescription('**SUPPRIMÉ**\n' + sentMessage.embeds[0].description);
                    
                    await sentMessage.edit({ embeds: [updatedEmbed] });
                    
                    // Supprimer les réactions
                    sentMessage.reactions.removeAll().catch(error => console.error('Impossible de supprimer les réactions:', error));
                  });
                  
                  confirmCollector.on('end', collected => {
                    if (collected.size === 0) {
                      confirmMsg.edit('❌ Suppression annulée (délai expiré)');
                    }
                  });
                  break;
              }
            } catch (error) {
              console.error('Erreur action:', error);
              sentMessage.reply(`❌ Erreur lors de l'action "${reaction.emoji.name}"`);
            }
          });
        }

        // Ajouter un message pour arrêter tous les collecteurs après 5 minutes
        setTimeout(() => {
          allCollectors.forEach(collector => {
            if (!collector.ended) collector.stop();
          });
          console.log('Tous les collecteurs ont été arrêtés');
        }, 300000); // 5 minutes
        
        // Envoyer un message récapitulatif
        const statsEmbed = new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('📊 Résumé des Torrents')
          .setDescription(`${torrents.length} torrents affichés`)
          .addFields(
            { 
              name: '📈 Statistiques', 
              value: `• En téléchargement: ${torrents.filter(t => t.state.includes('downloading')).length}
• En upload: ${torrents.filter(t => t.state.includes('uploading')).length}
• Terminés: ${torrents.filter(t => t.progress === 1).length}
• En pause: ${torrents.filter(t => t.state.includes('paused')).length}` 
            },
            {
              name: '🔄 Vitesses Globales',
              value: `• ⬇️ ${formatSpeed(torrents.reduce((acc, t) => acc + t.dlspeed, 0))}
• ⬆️ ${formatSpeed(torrents.reduce((acc, t) => acc + t.upspeed, 0))}`
            }
          )
          .setFooter({ text: 'Les réactions seront disponibles pendant 5 minutes' })
          .setTimestamp();
        
        await message.channel.send({ embeds: [statsEmbed] });
        } else {
        await message.reply('Aucun torrent actif.');
        console.log('Aucun torrent actif trouvé');
        }
      } catch (error) {
      console.error('Erreur API:', error.response?.data || error.message);
      await message.reply('❌ Erreur API - Vérifiez les logs');
    }
  }
  
  // Commande !status - Exécute le script discord_notify.sh pour obtenir le statut du Raspberry Pi
  else if (message.content.startsWith('!status')) {
    try {
      console.log('Commande !status reçue - Exécution du script discord_notify.sh');
      
      // Exécuter le script discord_notify.sh avec l'argument "status"
      exec('/home/Jaafar/discord_notify.sh status', async (error, stdout, stderr) => {
        if (error) {
          console.error(`Erreur d'exécution du script: ${error}`);
          await message.reply(`❌ Erreur lors de l'exécution du script: ${error.message}`);
          return;
        }
        
        if (stderr) {
          console.error(`Erreur du script: ${stderr}`);
        }
        
        // Si le script ne renvoie pas de sortie, envoyer un message par défaut
        if (!stdout || stdout.trim() === '') {
          await message.reply('✅ Commande exécutée, mais aucune sortie n\'a été produite.');
    } else {
          // Envoyer la sortie du script
          await message.reply(`📊 **Statut du Raspberry Pi**\n\n${stdout}`);
        }
      });
    } catch (error) {
      console.error('Erreur lors de l\'exécution de la commande !status:', error);
      await message.reply('❌ Une erreur est survenue lors de l\'exécution de la commande');
    }
  }
  
  // Commande !torrentstatus - Version simplifiée de !statustorrent (anciennement !status)
  else if (message.content.startsWith('!torrentstatus')) {
    try {
      console.log('Commande !torrentstatus reçue');
      
      // Vérifier la connexion
      if (!SID || !(await checkSession())) {
        const loggedIn = await loginToQBittorrent();
        if (!loggedIn) {
          await message.reply('❌ Connexion à qBittorrent échouée');
          return;
        }
      }

      // Récupérer les infos des torrents
      const response = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/info`, {
        headers: { 'Cookie': `SID=${SID}` }
      });

      if (response.status === 200 && response.data.length > 0) {
        console.log(`${response.data.length} torrents trouvés`);
        
        // Créer un embed pour tous les torrents
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('📊 État des Torrents')
          .setDescription(`${response.data.length} torrents trouvés`)
          .setTimestamp();
        
        // Ajouter les torrents actifs
        const activeTorrents = response.data.filter(t => 
          t.state === 'downloading' || t.state === 'stalledDL' || t.state === 'metaDL' || t.state === 'uploading'
        );
        
        if (activeTorrents.length > 0) {
          let activeText = '';
          for (const torrent of activeTorrents.slice(0, 10)) { // Limiter à 10 pour éviter les messages trop longs
            activeText += `• **${torrent.name.substring(0, 40)}${torrent.name.length > 40 ? '...' : ''}**\n`;
            activeText += `  ${(torrent.progress * 100).toFixed(1)}% | ⬇️ ${formatSpeed(torrent.dlspeed)} | ⬆️ ${formatSpeed(torrent.upspeed)}\n`;
          }
          
          if (activeTorrents.length > 10) {
            activeText += `... et ${activeTorrents.length - 10} autres torrents actifs`;
          }
          
          embed.addFields({ name: `⚡ Torrents Actifs (${activeTorrents.length})`, value: activeText || 'Aucun torrent actif' });
        }
        
        // Ajouter les statistiques globales
        const totalDownloadSpeed = response.data.reduce((acc, t) => acc + t.dlspeed, 0);
        const totalUploadSpeed = response.data.reduce((acc, t) => acc + t.upspeed, 0);
        const totalSize = response.data.reduce((acc, t) => acc + t.size, 0);
        
        embed.addFields({ 
          name: '📈 Statistiques Globales', 
          value: `• Torrents: ${response.data.length}\n• Taille totale: ${formatSize(totalSize)}\n• Vitesse ⬇️: ${formatSpeed(totalDownloadSpeed)}\n• Vitesse ⬆️: ${formatSpeed(totalUploadSpeed)}` 
        });
        
        await message.channel.send({ embeds: [embed] });
        } else {
        await message.reply('Aucun torrent actif.');
        }
    } catch (error) {
      console.error('Erreur API:', error.response?.data || error.message);
      await message.reply('❌ Erreur API - Vérifiez les logs');
    }
  }

  // Commande !list - Liste tous les torrents
  else if (message.content.startsWith('!list')) {
    try {
      console.log('Commande !list reçue');
      
      // Vérifier la connexion
      if (!SID || !(await checkSession())) {
        const loggedIn = await loginToQBittorrent();
        if (!loggedIn) {
          await message.reply('❌ Connexion à qBittorrent échouée');
          return;
        }
      }

      // Récupérer les infos des torrents
      const response = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/info`, {
        headers: { 'Cookie': `SID=${SID}` }
      });

      if (response.status === 200 && response.data.length > 0) {
        console.log(`${response.data.length} torrents trouvés`);
        
        // Trier les torrents par état
        const torrents = response.data.sort((a, b) => {
          // Priorité: downloading > uploading > completed > autres
          const stateOrder = {
            'downloading': 0,
            'stalledDL': 1,
            'metaDL': 2,
            'uploading': 3,
            'stalledUP': 4,
            'pausedDL': 5,
            'pausedUP': 6,
            'queuedDL': 7,
            'queuedUP': 8,
            'error': 9,
            'missingFiles': 10,
            'unknown': 11
          };
          
          return (stateOrder[a.state] || 99) - (stateOrder[b.state] || 99);
        });
        
        // Créer des messages par groupes de 10 torrents
        const chunks = [];
        for (let i = 0; i < torrents.length; i += 10) {
          chunks.push(torrents.slice(i, i + 10));
        }
        
        for (let i = 0; i < chunks.length; i++) {
          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📋 Liste des Torrents (${i+1}/${chunks.length})`)
            .setTimestamp();
          
          let description = '';
          for (const torrent of chunks[i]) {
            // Emoji en fonction de l'état
            let stateEmoji;
            if (torrent.state.includes('downloading')) stateEmoji = '⬇️';
            else if (torrent.state.includes('uploading')) stateEmoji = '⬆️';
            else if (torrent.progress === 1) stateEmoji = '✅';
            else if (torrent.state.includes('paused')) stateEmoji = '⏸️';
            else if (torrent.state.includes('queued')) stateEmoji = '⏳';
            else if (torrent.state.includes('error')) stateEmoji = '❌';
            else stateEmoji = '❓';
            
            description += `${stateEmoji} **${torrent.name.substring(0, 50)}${torrent.name.length > 50 ? '...' : ''}**\n`;
            description += `   ${(torrent.progress * 100).toFixed(1)}% | ${formatSize(torrent.size)} | Ratio: ${torrent.ratio.toFixed(2)}\n\n`;
          }
          
          embed.setDescription(description);
          await message.channel.send({ embeds: [embed] });
        }
      } else {
        await message.reply('Aucun torrent trouvé.');
      }
    } catch (error) {
      console.error('Erreur API:', error.response?.data || error.message);
      await message.reply('❌ Erreur API - Vérifiez les logs');
    }
  }
  
  // Commande !detail - Affiche les détails d'un torrent spécifique
  else if (message.content.startsWith('!detail')) {
    try {
      console.log('Commande !detail reçue');
      
      // Extraire le nom ou l'index du torrent
      const args = message.content.split(' ').slice(1);
      if (args.length === 0) {
        return message.reply('❌ Veuillez spécifier un nom ou un numéro de torrent. Exemple: `!detail 1` ou `!detail nom_du_torrent`');
      }
      
      // Vérifier la connexion
      if (!SID || !(await checkSession())) {
        const loggedIn = await loginToQBittorrent();
        if (!loggedIn) {
          await message.reply('❌ Connexion à qBittorrent échouée');
          return;
        }
      }

      // Récupérer les infos des torrents
      const response = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/info`, {
                headers: { 'Cookie': `SID=${SID}` }
              });

      if (response.status === 200 && response.data.length > 0) {
        console.log(`${response.data.length} torrents trouvés`);
        
        let selectedTorrent;
        
        // Si l'argument est un nombre, utiliser comme index
        if (!isNaN(args[0]) && parseInt(args[0]) > 0 && parseInt(args[0]) <= response.data.length) {
          selectedTorrent = response.data[parseInt(args[0]) - 1];
        } else {
          // Sinon, rechercher par nom
          const searchTerm = args.join(' ').toLowerCase();
          selectedTorrent = response.data.find(t => 
            t.name.toLowerCase().includes(searchTerm)
          );
        }
        
        if (selectedTorrent) {
          console.log(`Torrent trouvé: ${selectedTorrent.name}`);
          
          // Générer la vue détaillée
          const detailedView = await getDetailedTorrentView(selectedTorrent);
          
          if (detailedView && detailedView.embeds) {
            const reply = await message.channel.send({ embeds: detailedView.embeds });
            
            // Enregistrer le message pour les mises à jour automatiques
            if (detailedView.registerMessage && typeof detailedView.registerMessage === 'function') {
              detailedView.registerMessage(reply);
        }
      } else {
            await message.reply('❌ Erreur lors de la génération de la vue détaillée');
          }
        } else {
          await message.reply('❌ Torrent non trouvé. Vérifiez le nom ou le numéro.');
        }
      } else {
        await message.reply('Aucun torrent trouvé.');
      }
    } catch (error) {
      console.error('Erreur API:', error.response?.data || error.message);
      await message.reply('❌ Erreur API - Vérifiez les logs');
    }
  }
  
  // Commande !disk - Affiche l'espace disque
  else if (message.content.startsWith('!disk')) {
    try {
      console.log('Commande !disk reçue');
      
      // Exécuter la commande df pour obtenir l'espace disque
      const { stdout } = await new Promise((resolve, reject) => {
        exec(`df -h ${config.bot.defaultSavePath}`, (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve({ stdout, stderr });
        });
      });
      
      // Analyser la sortie pour obtenir les informations
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) throw new Error('Format de sortie df inattendu');
      
      const headers = lines[0].split(/\s+/).filter(Boolean);
      const diskInfo = lines[1].split(/\s+/).filter(Boolean);
      
      // Créer un embed avec les informations
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('💾 Informations Espace Disque')
        .addFields(
          { name: 'Système de fichiers', value: diskInfo[0], inline: true },
          { name: 'Taille', value: diskInfo[1], inline: true },
          { name: 'Utilisé', value: diskInfo[2], inline: true },
          { name: 'Disponible', value: diskInfo[3], inline: true },
          { name: 'Utilisation', value: diskInfo[4], inline: true },
          { name: 'Point de montage', value: diskInfo[5], inline: true }
        )
        .setTimestamp();
      
      // Ajouter une barre de progression
      const usagePercent = parseInt(diskInfo[4].replace('%', ''));
      let progressBar = '';
      const barLength = 20;
      const filledLength = Math.round(barLength * usagePercent / 100);
      
      for (let i = 0; i < barLength; i++) {
        if (i < filledLength) {
          progressBar += '█';
        } else {
          progressBar += '░';
        }
      }
      
      // Couleur en fonction de l'utilisation
      let color;
      if (usagePercent >= 90) color = '🔴';
      else if (usagePercent >= 70) color = '🟠';
      else color = '🟢';
      
      embed.addFields({ name: 'Utilisation', value: `${color} ${progressBar} ${usagePercent}%` });
      
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Erreur lors de la vérification de l\'espace disque:', error);
      await message.reply('❌ Erreur lors de la vérification de l\'espace disque');
    }
  }
  
  // Commande !help - Affiche l'aide
  else if (message.content.startsWith('!help')) {
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('📚 Aide du Bot qBittorrent')
      .setDescription('Voici les commandes disponibles:')
      .addFields(
        { name: '!status', value: 'Affiche le statut du Raspberry Pi (température, espace disque, uptime)' },
        { name: '!torrentstatus', value: 'Affiche un résumé de l\'état des torrents' },
        { name: '!list', value: 'Liste tous les torrents avec leurs détails' },
        { name: '!statustorrent', value: 'Affiche chaque torrent avec des boutons de contrôle' },
        { name: '!detail <nom/numéro>', value: 'Affiche les détails d\'un torrent spécifique' },
        { name: '!disk', value: 'Affiche les informations d\'espace disque' },
        { name: '!config', value: 'Affiche la configuration actuelle du bot' },
        { name: '!help', value: 'Affiche ce message d\'aide' },
        { name: 'Fichiers .torrent', value: 'Envoyez un fichier .torrent dans le canal pour l\'ajouter à qBittorrent (avec confirmation)' }
      )
      .setTimestamp();
    
    await message.channel.send({ embeds: [embed] });
  }
  
  // Commande !config - Affiche la configuration
  else if (message.content.startsWith('!config')) {
    try {
      const configText = formatConfig(config);
      await message.channel.send(configText);
    } catch (error) {
      console.error('Erreur lors de l\'affichage de la configuration:', error);
      await message.reply('❌ Erreur lors de l\'affichage de la configuration');
    }
  }
});

// Map pour stocker les messages de vue détaillée
const detailedViewMessages = new Map();

// Fonction pour obtenir les fichiers d'un torrent
async function getTorrentFiles(hash) {
  try {
    const response = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/files?hash=${hash}`, {
      headers: { 'Cookie': `SID=${SID}` }
    });
    
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la récupération des fichiers:', error);
    return null;
  }
}

// Fonction pour obtenir les trackers d'un torrent
async function getTorrentTrackers(hash) {
  try {
    const response = await axios.get(`${QBITTORRENT_HOST}/api/v2/torrents/trackers?hash=${hash}`, {
      headers: { 'Cookie': `SID=${SID}` }
    });
    
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la récupération des trackers:', error);
    return null;
  }
}

// Fonction pour créer une barre de progression visuelle
function createProgressBar(progress, length = 15) {
  const filledLength = Math.round(length * progress);
  let bar = '';
  
  // Caractères pour une barre de progression plus esthétique
  const emptyChar = '░';
  const filledChar = '█';
  
  for (let i = 0; i < length; i++) {
    if (i < filledLength) {
      bar += filledChar;
    } else {
      bar += emptyChar;
    }
  }
  
  return bar;
}

// Mettre à jour la configuration pour désactiver l'affichage des trackers et des peers
if (config.bot.detailedView) {
  config.bot.detailedView.showTrackers = false;
  config.bot.detailedView.showPeers = false;
  
  // Sauvegarder la configuration mise à jour
  saveConfig();
  console.log('Configuration mise à jour: affichage des trackers et des peers désactivé');
}