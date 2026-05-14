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

import play from "play-dl";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

const queue = new Map();

// 🌸 Commands
const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song 🎧")
    .addStringOption(option =>
      option.setName("query")
        .setDescription("Song name or URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip song ⏭️"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop music 🛑"),

  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show queue 📜")
].map(cmd => cmd.toJSON());

// 🚀 Register commands
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("Registering commands...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("Commands registered!");
  } catch (err) {
    console.error(err);
  }
})();

// 🎵 Player logic
async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);

  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  try {
    const stream = await play.stream(song.url);

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type
    });

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
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 💬 Interaction handler
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "play") {
    const query = interaction.options.getString("query");
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply("🚫 Join a VC first.");
    }

    await interaction.deferReply();

    const results = await play.search(query, { limit: 1 });

    if (!results.length) {
      return interaction.editReply("❌ No results found.");
    }

    const song = {
      title: results[0].title,
      url: results[0].url,
      thumbnail: results[0].thumbnails[0]?.url
    };

    let serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue) {
      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Pause
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
      .setColor("#1e1f22")
      .setTitle("🎶 Now Playing")
      .setDescription(`**${song.title}**`)
      .setThumbnail(song.thumbnail || null)
      .setFooter({ text: "aesthetic vibes ✨" });

    await interaction.editReply({ embeds: [embed] });

    if (serverQueue.songs.length === 1) {
      playSong(interaction.guild, song);
    }
  }

  if (commandName === "skip") {
    const serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue) {
      return interaction.reply("❌ Nothing playing.");
    }

    serverQueue.player.stop();
    interaction.reply("⏭️ Skipped.");
  }

  if (commandName === "stop") {
    const serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue) {
      return interaction.reply("❌ Nothing to stop.");
    }

    serverQueue.connection.destroy();
    queue.delete(interaction.guild.id);

    interaction.reply("🛑 Stopped.");
  }

  if (commandName === "queue") {
    const serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue || serverQueue.songs.length === 0) {
      return interaction.reply("📭 Queue empty.");
    }

    const list = serverQueue.songs
      .map((s, i) => `${i + 1}. ${s.title}`)
      .slice(0, 10)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("📜 Queue")
      .setDescription(list);

    interaction.reply({ embeds: [embed] });
  }
});

// 🔐 Login
client.login(process.env.TOKEN);
