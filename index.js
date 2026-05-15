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

// 🔥 Debug protection
process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const queue = new Map();

// 🎧 Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a YouTube song 🎶")
    .addStringOption(option =>
      option
        .setName("url")
        .setDescription("YouTube URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip current song ⏭️"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop music 🛑")

].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

// 🚀 Register commands
(async () => {
  try {
    console.log("Registering slash commands...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("Slash commands registered!");
  } catch (err) {
    console.error(err);
  }
})();

// 🎵 Play Function
async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);

  if (!song) {
    console.log("Queue ended");
    return;
  }

  try {
    console.log(`Playing: ${song.title}`);

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
    console.error("Playback Error:", err);

    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  }
}

// 🎧 Bot Ready
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 💬 Slash Command Handler
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // 🎶 PLAY
  if (commandName === "play") {

    const url = interaction.options.getString("url");
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply("🚫 Join a voice channel first!");
    }

    if (!ytdl.validateURL(url)) {
      return interaction.reply("❌ Invalid YouTube URL");
    }

    await interaction.deferReply();

    try {

      const info = await ytdl.getInfo(url);

      const song = {
        title: info.videoDetails.title,
        url: info.videoDetails.video_url,
        thumbnail: info.videoDetails.thumbnails[0]?.url
      };

      let serverQueue = queue.get(interaction.guild.id);

      // 🎧 Create queue
      if (!serverQueue) {

        const player = createAudioPlayer({
          behaviors: {
            noSubscriber: NoSubscriberBehavior.Play
          }
        });

        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
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
        .setDescription(`**${song.title}**`)
        .setThumbnail(song.thumbnail || null)
        .setFooter({ text: "aesthetic vibes ✨" });

      await interaction.editReply({
        embeds: [embed]
      });

      if (serverQueue.songs.length === 1) {
        playSong(interaction.guild, song);
      }

    } catch (err) {
      console.error(err);

      interaction.editReply("❌ Failed to play this video.");
    }
  }

  // ⏭️ SKIP
  if (commandName === "skip") {

    const serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue) {
      return interaction.reply("❌ Nothing playing.");
    }

    serverQueue.player.stop();

    interaction.reply("⏭️ Skipped!");
  }

  // 🛑 STOP
  if (commandName === "stop") {

    const serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue) {
      return interaction.reply("❌ Nothing playing.");
    }

    serverQueue.connection.destroy();

    queue.delete(interaction.guild.id);

    interaction.reply("🛑 Stopped and left VC.");
  }
});

// 🔐 Login
client.login(process.env.TOKEN);
