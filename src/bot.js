//grabbing private bot token from a local file
require('dotenv').config();
const { discordToken, mongodbToken } = process.env;
const { connect } = require('mongoose');

//imports
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const events = require('events');
events.EventEmitter.defaultMaxListeners = 1000;
events.defaultMaxListeners = 1000;

//consts for the botClient and all commands
const client = new Client({ intents: 
    [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildEmojisAndStickers,
    ],
});
client.commands = new Collection();
client.commandArray = [];

//Letting the bot know where the *functions* folder is and importing all files inside of it
const functionFolders = fs.readdirSync(`./src/functions`);
for (const folder of functionFolders) {
    const functionFiles = fs
        .readdirSync(`./src/functions/${folder}`)
        .filter(file => file.endsWith(".js"));

        for (const file of functionFiles) 
            require(`./functions/${folder}/${file}`)(client);
}

const utilsFolders = fs.readdirSync(`./src/utils`);
for (const folder of utilsFolders) {
    const utilsFiles = fs
        .readdirSync(`./src/utils/${folder}`)
        .filter(file => file.endsWith(".js"));

        for (const file of utilsFiles)
            require(`./utils/${folder}/${file}`);
}

//Calling functions
client.handleEvents();
client.handleCommands();
client.login(discordToken);
(async () => {
    await connect(mongodbToken, { 
         // Connection Pooling 
        maxPoolSize: 100,          // Max number of sockets the driver can have open concurrently
        minPoolSize: 10,           // Keeps a few idle connections ready for faster requests

        // Timeouts
        connectTimeoutMS: 20000,   // 20s to establish a connection
        socketTimeoutMS: 45000,    // 45s before closing inactive sockets
        serverSelectionTimeoutMS: 15000, // 15s before failing to connect to a server

        // Retry Logic
        retryWrites: true,         // Retries failed writes automatically (if network issue)
        w: "majority",             // Ensures writes are acknowledged by most nodes
        wtimeoutMS: 5000,          // Timeout for write acknowledgment

        // Compression & Performance
        //maxIdleTimeMS: 30000,      // Closes idle connections after 30s to free up pool slots

        // Monitoring & Stability
        heartbeatFrequencyMS: 10000, // Checks server health regularly
        family: 4,                  // Force IPv4 (avoid IPv6 connection issues)
     }).catch(console.error);
})();
