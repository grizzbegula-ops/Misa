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

// 🔥 crash debug (important)
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
    .setDescription("Play music 🎧")
    .addStringOption(option =>
      option.setName("query").setDescription("Song").setRequired(true)
    ),
  new SlashCommandBuilder().setName("skip").setDescription("Skip ⏭️"),
  new SlashCommandBuilder().setName("stop").setDescription("Stop 🛑"),
  new SlashCommandBuilder().setName("queue").setDescription("Queue 📜")
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
    return; // ❗ DO NOT leave VC instantly
  }

  try {
    console.log("Playing:", song.title);

    const stream = await play.stream(song.url);

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true
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

// 💬 Commands
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "play") {
    const query = interaction.options.getString("query");
    const vc = interaction.member.voice.channel;

    if (!vc) return interaction.reply("🚫 Join VC first");

    await interaction.deferReply();

    const results = await play.search(query, { limit: 1 });
    if (!results.length) return interaction.editReply("❌ No results");

    const song = {
      title: results[0].title,
      url: results[0].url,
      thumbnail: results[0].thumbnails[0]?.url
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
      .setFooter({ text: "vibe mode ✨" });

    await interaction.editReply({ embeds: [embed] });

    if (serverQueue.songs.length === 1) {
      playSong(interaction.guild, song);
    }
  }

  if (commandName === "skip") {
    const q = queue.get(interaction.guild.id);
    if (!q) return interaction.reply("❌ Nothing playing");

    q.player.stop();
    interaction.reply("⏭️ Skipped");
  }

  if (commandName === "stop") {
    const q = queue.get(interaction.guild.id);
    if (!q) return interaction.reply("❌ Nothing playing");

    q.connection.destroy();
    queue.delete(interaction.guild.id);

    interaction.reply("🛑 Stopped");
  }

  if (commandName === "queue") {
    const q = queue.get(interaction.guild.id);
    if (!q || !q.songs.length) return interaction.reply("📭 Empty");

    const list = q.songs
      .map((s, i) => `${i + 1}. ${s.title}`)
      .join("\n");

    interaction.reply(`📜 Queue:\n${list}`);
  }
});

// 🔐 Login
client.login(process.env.TOKEN);
