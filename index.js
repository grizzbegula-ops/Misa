const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
require('dotenv/config');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const queues = new Map();
const TOKEN = process.env.TOKEN;
const PREFIX = process.env.PREFIX || '!';

class MusicQueue {
    constructor() {
        this.songs = [];
        this.player = createAudioPlayer();
        this.connection = null;
        this.currentSong = null;
        this.loop = false;
        this.volume = 100;
        this.isPlaying = false;
    }
}

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity(`${PREFIX}play | Music Bot`, { type: ActivityType.Listening });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        if (command === 'play') await playSong(message, args.join(' '));
        else if (command === 'skip') await skipSong(message);
        else if (command === 'stop') await stopMusic(message);
        else if (command === 'pause') await pauseMusic(message);
        else if (command === 'resume') await resumeMusic(message);
        else if (command === 'queue') await showQueue(message);
        else if (command === 'loop') await toggleLoop(message);
        else if (command === 'volume') await setVolume(message, args[0]);
        else if (command === 'np') await nowPlaying(message);
        else if (command === 'clear') await clearQueue(message);
        else if (command === 'help') await showHelp(message);
    } catch (error) {
        console.error(error);
        message.reply('❌ An error occurred: ' + error.message);
    }
});

async function playSong(message, query) {
    if (!query) return message.reply('❌ Please provide a song name or URL!');
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('❌ You need to be in a voice channel!');

    let guildQueue = queues.get(message.guild.id);
    if (!guildQueue) {
        guildQueue = new MusicQueue();
        queues.set(message.guild.id, guildQueue);
    }

    await message.channel.sendTyping();

    let songInfo;
    try {
        let videoUrl = query;
        if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
            const searchResult = await ytSearch(query);
            if (!searchResult || !searchResult.videos.length) 
                return message.reply('❌ No results found!');
            videoUrl = searchResult.videos[0].url;
        }
        
        const videoInfo = await ytdl.getInfo(videoUrl);
        songInfo = {
            title: videoInfo.videoDetails.title,
            url: videoInfo.videoDetails.video_url,
            duration: formatDuration(videoInfo.videoDetails.lengthSeconds),
            thumbnail: videoInfo.videoDetails.thumbnails[0]?.url || '',
            author: videoInfo.videoDetails.author.name,
            requestedBy: message.author.tag
        };
    } catch (err) {
        console.error(err);
        return message.reply('❌ Could not find or play that song! It may be age-restricted or unavailable.');
    }

    guildQueue.songs.push(songInfo);

    const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎵 Added to Queue')
        .setDescription(`**[${songInfo.title}](${songInfo.url})**`)
        .addFields(
            { name: 'Duration', value: songInfo.duration, inline: true },
            { name: 'Position', value: `${guildQueue.songs.length}`, inline: true }
        )
        .setThumbnail(songInfo.thumbnail)
        .setFooter({ text: `Requested by ${message.author.tag}` });

    await message.reply({ embeds: [embed] });

    if (guildQueue.songs.length === 1) {
        await playNextSong(message.guild.id, voiceChannel);
    }
}

async function playNextSong(guildId, voiceChannel) {
    const guildQueue = queues.get(guildId);
    if (!guildQueue || guildQueue.songs.length === 0) {
        if (guildQueue?.connection) guildQueue.connection.destroy();
        queues.delete(guildId);
        return;
    }

    const song = guildQueue.songs[0];
    guildQueue.currentSong = song;

    if (!guildQueue.connection || guildQueue.connection.state.status === 'destroyed') {
        guildQueue.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });
        guildQueue.connection.subscribe(guildQueue.player);
    }

    try {
        const stream = ytdl(song.url, { filter: 'audioonly', quality: 'lowestaudio' });
        const resource = createAudioResource(stream, { inlineVolume: true });
        resource.volume.setVolumeLogarithmic(guildQueue.volume / 100);
        
        guildQueue.player.play(resource);
        guildQueue.isPlaying = true;

        guildQueue.player.on(AudioPlayerStatus.Idle, () => {
            if (guildQueue.loop) {
                guildQueue.songs.push(guildQueue.songs[0]);
                guildQueue.songs.shift();
            } else {
                guildQueue.songs.shift();
            }
            playNextSong(guildId, voiceChannel);
        });
    } catch (err) {
        console.error('Stream error:', err);
        guildQueue.songs.shift();
        playNextSong(guildId, voiceChannel);
    }
}

function formatDuration(seconds) {
    if (!seconds) return 'Live';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

async function skipSong(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || !guildQueue.songs.length) return message.reply('❌ Nothing playing!');
    guildQueue.player.stop();
    message.reply('⏭️ Skipped!');
}

async function stopMusic(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue) return message.reply('❌ Nothing playing!');
    guildQueue.songs = [];
    guildQueue.player.stop();
    if (guildQueue.connection) guildQueue.connection.destroy();
    queues.delete(message.guild.id);
    message.reply('⏹️ Stopped music and cleared queue!');
}

async function pauseMusic(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || !guildQueue.isPlaying) return message.reply('❌ Nothing playing!');
    guildQueue.player.pause();
    guildQueue.isPlaying = false;
    message.reply('⏸️ Paused!');
}

async function resumeMusic(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || guildQueue.isPlaying) return message.reply('❌ No paused music!');
    guildQueue.player.unpause();
    guildQueue.isPlaying = true;
    message.reply('▶️ Resumed!');
}

async function showQueue(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || !guildQueue.songs.length) return message.reply('📭 Queue empty!');
    
    let desc = guildQueue.songs.slice(0, 10).map((s, i) => `${i+1}. ${s.title} (${s.duration})`).join('\n');
    const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('Queue').setDescription(desc);
    message.reply({ embeds: [embed] });
}

async function toggleLoop(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue) return message.reply('❌ No queue!');
    guildQueue.loop = !guildQueue.loop;
    message.reply(guildQueue.loop ? '🔁 Loop on' : '🔁 Loop off');
}

async function setVolume(message, vol) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue) return message.reply('❌ Nothing playing!');
    let v = parseInt(vol);
    if (isNaN(v) || v < 0 || v > 200) return message.reply('Volume 0-200');
    guildQueue.volume = v;
    if (guildQueue.player.state.resource) 
        guildQueue.player.state.resource.volume.setVolumeLogarithmic(v/100);
    message.reply(`🔊 Volume ${v}%`);
}

async function nowPlaying(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || !guildQueue.currentSong) return message.reply('❌ Nothing playing!');
    const s = guildQueue.currentSong;
    const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('Now Playing').setDescription(`[${s.title}](${s.url})`).setThumbnail(s.thumbnail);
    message.reply({ embeds: [embed] });
}

async function clearQueue(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || guildQueue.songs.length <= 1) return message.reply('No queue to clear');
    guildQueue.songs = [guildQueue.songs[0]];
    message.reply('🗑️ Cleared queue except current song');
}

async function showHelp(message) {
    const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('Commands')
        .setDescription(`${PREFIX}play <song/url>\n${PREFIX}skip\n${PREFIX}stop\n${PREFIX}pause\n${PREFIX}resume\n${PREFIX}queue\n${PREFIX}loop\n${PREFIX}volume <0-200>\n${PREFIX}np\n${PREFIX}clear\n${PREFIX}help`);
    message.reply({ embeds: [embed] });
}

client.login(TOKEN);
