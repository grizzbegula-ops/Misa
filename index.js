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
        if (command === 'play') {
            await playSong(message, args.join(' '));
        } 
        else if (command === 'skip') {
            await skipSong(message);
        }
        else if (command === 'stop') {
            await stopMusic(message);
        }
        else if (command === 'pause') {
            await pauseMusic(message);
        }
        else if (command === 'resume') {
            await resumeMusic(message);
        }
        else if (command === 'queue') {
            await showQueue(message);
        }
        else if (command === 'loop') {
            await toggleLoop(message);
        }
        else if (command === 'volume') {
            await setVolume(message, args[0]);
        }
        else if (command === 'np') {
            await nowPlaying(message);
        }
        else if (command === 'clear') {
            await clearQueue(message);
        }
        else if (command === 'help') {
            await showHelp(message);
        }
    } catch (error) {
        console.error(error);
        message.reply('❌ An error occurred! Please try again.');
    }
});

async function playSong(message, query) {
    if (!query) {
        return message.reply('❌ Please provide a song name or URL!');
    }

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        return message.reply('❌ You need to be in a voice channel!');
    }

    let guildQueue = queues.get(message.guild.id);
    if (!guildQueue) {
        guildQueue = new MusicQueue();
        queues.set(message.guild.id, guildQueue);
    }

    await message.channel.sendTyping();

    let songInfo;
    try {
        let videoUrl = query;
        
        // Check if it's a URL or search query
        if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
            // Search for the video
            const searchResult = await ytSearch(query);
            if (!searchResult || !searchResult.videos.length) {
                return message.reply('❌ No results found!');
            }
            videoUrl = searchResult.videos[0].url;
        }
        
        // Get video info
        const videoInfo = await ytdl.getInfo(videoUrl);
        songInfo = {
            title: videoInfo.videoDetails.title,
            url: videoInfo.videoDetails.video_url,
            duration: formatDuration(videoInfo.videoDetails.lengthSeconds),
            thumbnail: videoInfo.videoDetails.thumbnails[0].url,
            author: videoInfo.videoDetails.author.name
        };
        
    } catch (error) {
        console.error(error);
        return message.reply('❌ Could not find or play that song! Make sure the URL is valid.');
    }

    songInfo.requestedBy = message.author.tag;
    guildQueue.songs.push(songInfo);

    const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎵 Added to Queue')
        .setDescription(`**[${songInfo.title}](${songInfo.url})**`)
        .addFields(
            { name: 'Duration', value: songInfo.duration, inline: true },
            { name: 'Channel', value: songInfo.author, inline: true },
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
        if (guildQueue?.connection) {
            guildQueue.connection.destroy();
            queues.delete(guildId);
        }
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
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            quality: 'lowestaudio',
            highWaterMark: 1 << 25
        });
        
        const resource = createAudioResource(stream, {
            inlineVolume: true
        });
        
        resource.volume.setVolumeLogarithmic(guildQueue.volume / 100);
        
        guildQueue.player.play(resource);
        guildQueue.isPlaying = true;

        guildQueue.player.on(AudioPlayerStatus.Idle, () => {
            if (guildQueue.loop && guildQueue.songs.length > 0) {
                const currentSong = guildQueue.songs[0];
                guildQueue.songs.push(currentSong);
                guildQueue.songs.shift();
            } else {
                guildQueue.songs.shift();
            }
            playNextSong(guildId, voiceChannel);
        });

        guildQueue.player.on('error', (error) => {
            console.error('Player error:', error);
            guildQueue.songs.shift();
            playNextSong(guildId, voiceChannel);
        });

    } catch (error) {
        console.error('Stream error:', error);
        guildQueue.songs.shift();
        playNextSong(guildId, voiceChannel);
    }
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

async function skipSong(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || guildQueue.songs.length === 0) {
        return message.reply('❌ Nothing is playing!');
    }
    
    guildQueue.player.stop();
    message.reply('⏭️ Skipped the current song!');
}

async function stopMusic(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue) return message.reply('❌ Nothing is playing!');
    
    guildQueue.songs = [];
    guildQueue.player.stop();
    if (guildQueue.connection) guildQueue.connection.destroy();
    queues.delete(message.guild.id);
    message.reply('⏹️ Stopped the music and cleared the queue!');
}

async function pauseMusic(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || !guildQueue.isPlaying) return message.reply('❌ Nothing is playing!');
    
    guildQueue.player.pause();
    guildQueue.isPlaying = false;
    message.reply('⏸️ Paused the music!');
}

async function resumeMusic(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || guildQueue.isPlaying) return message.reply('❌ No paused music found!');
    
    guildQueue.player.unpause();
    guildQueue.isPlaying = true;
    message.reply('▶️ Resumed the music!');
}

async function showQueue(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || guildQueue.songs.length === 0) {
        return message.reply('📭 The queue is empty!');
    }

    const queueList = guildQueue.songs.slice(0, 10).map((song, index) => 
        `${index + 1}. **[${song.title}](${song.url})** - \`${song.duration}\``
    ).join('\n');

    const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📋 Music Queue')
        .setDescription(queueList)
        .addFields({ name: 'Total Songs', value: `${guildQueue.songs.length}`, inline: true })
        .setFooter({ text: `Currently playing: ${guildQueue.currentSong?.title || 'None'}` });

    message.reply({ embeds: [embed] });
}

async function toggleLoop(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || guildQueue.songs.length === 0) {
        return message.reply('❌ No queue found!');
    }
    
    guildQueue.loop = !guildQueue.loop;
    message.reply(guildQueue.loop ? '🔁 Loop enabled!' : '🔁 Loop disabled!');
}

async function setVolume(message, volume) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue) return message.reply('❌ Nothing is playing!');
    
    const newVolume = parseInt(volume);
    if (isNaN(newVolume) || newVolume < 0 || newVolume > 200) {
        return message.reply('❌ Please provide a volume between 0 and 200!');
    }
    
    guildQueue.volume = newVolume;
    if (guildQueue.player.state.resource) {
        guildQueue.player.state.resource.volume.setVolumeLogarithmic(newVolume / 100);
    }
    message.reply(`🔊 Volume set to ${newVolume}%!`);
}

async function nowPlaying(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || !guildQueue.currentSong) {
        return message.reply('❌ No song is currently playing!');
    }

    const song = guildQueue.currentSong;
    const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎵 Now Playing')
        .setDescription(`**[${song.title}](${song.url})**`)
        .addFields(
            { name: 'Duration', value: song.duration, inline: true },
            { name: 'Channel', value: song.author, inline: true },
            { name: 'Volume', value: `${guildQueue.volume}%`, inline: true }
        )
        .setThumbnail(song.thumbnail)
        .setFooter({ text: `Requested by ${song.requestedBy}` });

    message.reply({ embeds: [embed] });
}

async function clearQueue(message) {
    const guildQueue = queues.get(message.guild.id);
    if (!guildQueue || guildQueue.songs.length === 0) {
        return message.reply('📭 Queue is already empty!');
    }
    
    guildQueue.songs = [guildQueue.songs[0]];
    message.reply('🗑️ Cleared the queue!');
}

async function showHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎵 Music Bot Commands')
        .setDescription('Here are all available commands:')
        .addFields(
            { name: `${PREFIX}play <song/url>`, value: 'Play a song from YouTube', inline: false },
            { name: `${PREFIX}skip`, value: 'Skip the current song', inline: true },
            { name: `${PREFIX}stop`, value: 'Stop music and clear queue', inline: true },
            { name: `${PREFIX}pause`, value: 'Pause the current song', inline: true },
            { name: `${PREFIX}resume`, value: 'Resume the paused song', inline: true },
            { name: `${PREFIX}queue`, value: 'Show the song queue', inline: true },
            { name: `${PREFIX}loop`, value: 'Toggle loop mode', inline: true },
            { name: `${PREFIX}volume <0-200>`, value: 'Adjust volume', inline: true },
            { name: `${PREFIX}np`, value: 'Show currently playing song', inline: true },
            { name: `${PREFIX}clear`, value: 'Clear the queue', inline: true },
            { name: `${PREFIX}help`, value: 'Show this help message', inline: true }
        )
        .setFooter({ text: 'Made with ❤️ for Discord' });

    message.reply({ embeds: [embed] });
}

client.login(TOKEN);
