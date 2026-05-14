const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require('discord.js');

const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const distube = new DisTube(client, {
  leaveOnStop: true,
  leaveOnEmpty: true,
  emitNewSongOnly: true,
  plugins: [new YtDlpPlugin()]
});

// 🎯 COMMANDS
const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play music')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Song name or URL')
        .setRequired(true)
    ),

  new SlashCommandBuilder().setName('skip').setDescription('Skip song'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop music'),
  new SlashCommandBuilder().setName('pause').setDescription('Pause music'),
  new SlashCommandBuilder().setName('resume').setDescription('Resume music'),
  new SlashCommandBuilder().setName('queue').setDescription('Show queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Now playing'),
  new SlashCommandBuilder().setName('leave').setDescription('Leave VC')

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 🚀 REGISTER COMMANDS (GUILD = INSTANT FIX)
(async () => {
  try {
    console.log("⚡ Registering guild commands...");

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ Commands ready (no cache bug)");

  } catch (err) {
    console.error(err);
  }
})();

client.once('clientReady', () => {
  console.log(`${client.user.tag} online ✨`);
});

client.on('interactionCreate', async interaction => {

  // 🎛️ BUTTON CONTROLS
  if (interaction.isButton()) {

    const queue = distube.getQueue(interaction.guildId);
    if (!queue) {
      return interaction.reply({ content: '❌ Nothing playing.', ephemeral: true });
    }

    if (interaction.customId === 'pause') queue.pause();
    if (interaction.customId === 'resume') queue.resume();
    if (interaction.customId === 'skip') queue.skip();
    if (interaction.customId === 'stop') queue.stop();

    return interaction.reply({ content: '✅ Done', ephemeral: true });
  }

  if (!interaction.isChatInputCommand()) return;

  const voiceChannel = interaction.member.voice.channel;

  if (!['queue', 'nowplaying'].includes(interaction.commandName)) {
    if (!voiceChannel) {
      return interaction.reply({
        content: '🌸 Join a voice channel first.',
        ephemeral: true
      });
    }
  }

  // 🎶 PLAY (FIXED)
  if (interaction.commandName === 'play') {

    const song = interaction.options.getString('query');

    await interaction.deferReply();

    console.log("SONG INPUT:", song);

    // 💥 THIS LINE FIXES YOUR ERROR
    if (!song || song.trim() === '') {
      return interaction.editReply('❌ Enter a song name or URL.');
    }

    try {

      await distube.play(voiceChannel, song, {
        member: interaction.member,
        textChannel: interaction.channel
      });

      await interaction.editReply(`🎶 Playing **${song}**`);

    } catch (err) {

      console.error("PLAY ERROR:", err);

      await interaction.editReply('❌ Could not play song.');
    }
  }

  if (interaction.commandName === 'skip') {
    const queue = distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply('❌ Nothing playing.');
    queue.skip();
    interaction.reply('⏭️ Skipped.');
  }

  if (interaction.commandName === 'stop') {
    const queue = distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply('❌ Nothing playing.');
    queue.stop();
    interaction.reply('🛑 Stopped.');
  }

  if (interaction.commandName === 'pause') {
    const queue = distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply('❌ Nothing playing.');
    queue.pause();
    interaction.reply('⏸️ Paused.');
  }

  if (interaction.commandName === 'resume') {
    const queue = distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply('❌ Nothing playing.');
    queue.resume();
    interaction.reply('▶️ Resumed.');
  }

  if (interaction.commandName === 'leave') {
    distube.voices.leave(interaction.guild);
    interaction.reply('👋 Left VC.');
  }

  if (interaction.commandName === 'queue') {
    const queue = distube.getQueue(interaction.guildId);
    if (!queue || !queue.songs.length) {
      return interaction.reply('❌ Queue empty.');
    }

    const songs = queue.songs
      .slice(0, 10)
      .map((song, i) => `${i + 1}. ${song.name}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor('#ffcce5')
      .setTitle('🎼 Queue')
      .setDescription(songs);

    interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'nowplaying') {
    const queue = distube.getQueue(interaction.guildId);
    if (!queue || !queue.songs.length) {
      return interaction.reply('❌ Nothing playing.');
    }

    const song = queue.songs[0];

    const embed = new EmbedBuilder()
      .setColor('#ffb6d9')
      .setTitle('🎧 Now Playing')
      .setDescription(`**${song.name}**`)
      .setURL(song.url)
      .setThumbnail(song.thumbnail);

    interaction.reply({ embeds: [embed] });
  }

});

// 🎵 EVENT
distube.on('playSong', (queue, song) => {
  queue.textChannel.send(`🎶 Now playing: **${song.name}**`);
});

client.login(TOKEN);
