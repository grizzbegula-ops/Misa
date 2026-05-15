import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior
} from "@discordjs/voice";

import ytdl from "@distube/ytdl-core";
import dotenv from "dotenv";

dotenv.config();

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

const queue = new Map();

// 🎧 Commands
const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play music")
    .addStringOption(option =>
      option
        .setName("url")
        .setDescription("YouTube URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip song"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop music")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

// 🚀 Register commands
(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("Commands registered");
  } catch (err) {
    console.error(err);
  }
})();

// 🎵 Play function
async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);

  if (!song) {
    console.log("Queue ended");
    return;
  }

  try {
    console.log("Playing:", song.title);

    const stream = ytdl(song.url, {
      filter: "audioonly",
      quality: "highestaudio",
      highWaterMark: 1 << 25
    });

    const resource = createAudioResource(stream);

    serverQueue.player.play(resource);

    serverQueue.player.once(AudioPlayerStatus.Idle, () => {
      serverQueue.songs.shift();
      playSong(guild, serverQueue.songs[0]);
    });

  } catch (err) {
    console.error("Playback error:", err);

    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  }
}

// 🎧 Ready
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 💬 Commands
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "play") {
    const url = interaction.options.getString("url");
    const vc = interaction.member.voice.channel;

    if (!vc) {
      return interaction.reply("🚫 Join a VC first");
    }

    if (!ytdl.validateURL(url)) {
      return interaction.reply("❌ Invalid YouTube URL");
    }

    await interaction.deferReply();

    const info = await ytdl.getInfo(url);

    const song = {
      title: info.videoDetails.title,
      url: info.videoDetails.video_url,
      thumbnail: info.videoDetails.thumbnails[0]?.url
    };

    let serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue) {
      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play
        }
      });

      const connection = joinVoiceChannel({
        channelId: vc.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator
      });

      serverQueue = {
        connection,
        player,
        songs: []
      };

      queue.set(interaction.guild.id, serverQueue);

      connection.subscribe(player);
    }

    serverQueue.songs.push(song);

    const embed = new EmbedBuilder()
      .setColor("#2b2d31")
      .setTitle("🎶 Now Playing")
      .setDescription(song.title)
      .setThumbnail(song.thumbnail || null)
      .setFooter({ text: "aesthetic vibes ✨" });

    await interaction.editReply({
      embeds: [embed]
    });

    if (serverQueue.songs.length === 1) {
      playSong(interaction.guild, song);
    }
  }

  if (commandName === "skip") {
    const q = queue.get(interaction.guild.id);

    if (!q) {
      return interaction.reply("❌ Nothing playing");
    }

    q.player.stop();

    interaction.reply("⏭️ Skipped");
  }

  if (commandName === "stop") {
    const q = queue.get(interaction.guild.id);

    if (!q) {
      return interaction.reply("❌ Nothing playing");
    }

    q.connection.destroy();

    queue.delete(interaction.guild.id);

    interaction.reply("🛑 Stopped");
  }
});

client.login(process.env.TOKEN);
