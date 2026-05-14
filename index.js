import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from "@discordjs/voice";
import play from "play-dl";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

const queue = new Map();

// 🎧 SLASH COMMANDS
const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song")
    .addStringOption(option =>
      option.setName("query")
        .setDescription("Song name or URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip current song"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop music and leave")
].map(cmd => cmd.toJSON());

// 🚀 REGISTER COMMANDS
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("Commands registered!");
  } catch (err) {
    console.error(err);
  }
})();

// 🎵 PLAY FUNCTION
async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  const stream = await play.stream(song.url);
  const resource = createAudioResource(stream.stream, {
    inputType: stream.type
  });

  serverQueue.player.play(resource);

  serverQueue.player.once(AudioPlayerStatus.Idle, () => {
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });
}

// 🎧 BOT READY
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 💬 COMMAND HANDLER
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "play") {
    const query = interaction.options.getString("query");
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply("Join a voice channel first!");
    }

    const search = await play.search(query, { limit: 1 });
    if (!search.length) {
      return interaction.reply("No results found.");
    }

    const song = {
      title: search[0].title,
      url: search[0].url
    };

    let serverQueue = queue.get(interaction.guild.id);

    if (!serverQueue) {
      const player = createAudioPlayer();

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

    await interaction.reply(`🎶 Playing: **${song.title}**`);

    if (serverQueue.songs.length === 1) {
      playSong(interaction.guild, serverQueue.songs[0]);
    }
  }

  if (commandName === "skip") {
    const serverQueue = queue.get(interaction.guild.id);
    if (!serverQueue) return interaction.reply("Nothing to skip!");

    serverQueue.player.stop();
    interaction.reply("⏭️ Skipped!");
  }

  if (commandName === "stop") {
    const serverQueue = queue.get(interaction.guild.id);
    if (!serverQueue) return interaction.reply("Nothing playing!");

    serverQueue.connection.destroy();
    queue.delete(interaction.guild.id);

    interaction.reply("🛑 Stopped and left!");
  }
});

// 🔐 LOGIN
client.login(process.env.TOKEN);
