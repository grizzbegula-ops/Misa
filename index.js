const { Client, GatewayIntentBits } = require('discord.js');
const { LavalinkClient } = require('lavalink-client');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const lavalink = new LavalinkClient({
    nodes: [{
        id: 'main',
        host: process.env.LAVALINK_HOST,
        port: parseInt(process.env.LAVALINK_PORT || '2333'),
        password: process.env.LAVALINK_PASSWORD,
        secure: false
    }],
    sendPayload: (guildId, payload) => {
        client.guilds.cache.get(guildId)?.shard.send(payload);
    }
});

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} is online`);
    await lavalink.init(client);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).split(' ');
    const cmd = args[0].toLowerCase();
    const query = args.slice(1).join(' ');
    
    if (cmd === 'play' && query) {
        const voice = message.member?.voice.channel;
        if (!voice) return message.reply('Join voice channel first!');
        
        const player = await lavalink.createPlayer({
            guildId: message.guild.id,
            voiceChannelId: voice.id,
            textChannelId: message.channel.id,
            selfDeaf: true
        });
        
        const result = await player.search(query, message.author.id);
        if (!result?.tracks.length) return message.reply('No results');
        
        player.queue.add(result.tracks[0]);
        if (!player.playing) await player.play();
        message.reply(`🎵 Added: ${result.tracks[0].info.title}`);
    }
    
    if (cmd === 'stop') {
        const player = lavalink.getPlayer(message.guild.id);
        if (player) await player.destroy();
        message.reply('⏹️ Stopped');
    }
});

client.login(process.env.DISCORD_TOKEN);
