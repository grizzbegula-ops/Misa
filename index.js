import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";

import { Player } from "discord-player";
import { YoutubeiExtractor } from "@discord-player/extractor";

import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// 🎵 Player
const player = new Player(client);

await player.extractors.register(YoutubeiExtractor, {});

// 🎧 Commands
const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play music 🎶")
    .addStringOption(option =>
      option
        .setName("query")
        .setDescription("Song name or URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip song ⏭️"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop music 🛑")

].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

// 🚀 Register Commands
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

// 🎧 Ready
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 🎶 Play Command
client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // 🎵 PLAY
  if (commandName === "play") {

    const query = interaction.options.getString("query");

    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply("🚫 Join a VC first");
    }

    await interaction.deferReply();

    try {

      const { track } = await player.play(voiceChannel, query, {
        nodeOptions: {
          metadata: interaction
        }
      });

      const embed = new EmbedBuilder()
        .setColor("#2b2d31")
        .setTitle("🎶 Now Playing")
        .setDescription(`**${track.title}**`)
        .setThumbnail(track.thumbnail)
        .setFooter({ text: "aesthetic vibes ✨" });

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (err) {

      console.error(err);

      interaction.editReply("❌ Unable to play this song.");
    }
  }

  // ⏭️ SKIP
  if (commandName === "skip") {

    const queue = player.nodes.get(interaction.guild.id);

    if (!queue) {
      return interaction.reply("❌ Nothing playing.");
    }

    queue.node.skip();

    interaction.reply("⏭️ Skipped!");
  }

  // 🛑 STOP
  if (commandName === "stop") {

    const queue = player.nodes.get(interaction.guild.id);

    if (!queue) {
      return interaction.reply("❌ Nothing playing.");
    }

    queue.delete();

    interaction.reply("🛑 Stopped music.");
  }
});

// 🔐 Login
client.login(process.env.TOKEN);
