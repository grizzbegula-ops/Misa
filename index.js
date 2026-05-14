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

// ✅ UPDATED COMMANDS
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
  new SlashCommandBuilder().setName('pause').setDescription('Pause'),
  new SlashCommandBuilder().setName('resume').setDescription('Resume'),
  new SlashCommandBuilder().setName('queue').setDescription('Queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Now playing'),
  new SlashCommandBuilder().setName('leave').setDescription('Leave VC')

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// ✅ AUTO REGISTER COMMANDS
(async () => {
  try {
    console.log('Refreshing slash commands...');

    // 🔥 CLEAR OLD COMMANDS (prevents your bug)
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log('Commands ready ✅');
  } catch (err) {
    console.error(err);
  }
})();

client.once('clientReady', () => {
  console.log(`${client.user.tag} online ✨`);
});

// 🎧 INTERACTIONS
client.on('interactionCreate', async interaction => {

  if (interaction.isButton()) {

    const queue = distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: '❌ Nothing playing', ephemeral: true });

    if (interaction.customId === 'pause') queue.pause();
    if (interaction.customId === 'resume') queue.resume();
    if (interaction.customId === 'skip') queue.skip();
    if (interaction.customId === 'stop') queue.stop();

    return interaction.reply({ content: '✅ Done', ephemeral: true });
  }

  if (!interaction.isChatInputCommand()) return;

  const vc = interaction.member.voice.channel;

  if (!['queue', 'nowplaying'].includes(interaction.commandName)) {
    if (!vc) {
      return interaction.reply({ content: '🌸 Join VC first', ephemeral: true });
    }
  }

  // 🎶 PLAY FIXED
  if (interaction.commandName === 'play') {

    const song = interaction.options.getString('query');

    await interaction.deferReply();

    // 💥 HARD FIX (this killed your error)
    if (!song || song.trim() === '') {
      return interaction.editReply('❌ Enter a song name or link');
    }

    try {

      console.log("PLAY INPUT:", song);

      await distube.play(vc, song, {
        member: interaction.member,
        textChannel: interaction.channel
      });

      interaction.editReply(`🎶 Playing **${song}**`);

    } catch (err) {
      console.error("PLAY ERROR:", err);
      interaction.editReply('❌ Failed to play');
    }
  }

  if (interaction.commandName === 'skip') {
    const q = distube.getQueue(interaction.guildId);
    if (!q) return interaction.reply('❌ Nothing playing');
    q.skip();
    interaction.reply('⏭️ Skipped');
  }

  if (interaction.commandName === 'stop') {
    const q = distube.getQueue(interaction.guildId);
    if (!q) return interaction.reply('❌ Nothing playing');
    q.stop();
    interaction.reply('🛑 Stopped');
  }

  if (interaction.commandName === 'pause') {
    const q = distube.getQueue(interaction.guildId);
    if (!q) return interaction.reply('❌ Nothing playing');
    q.pause();
    interaction.reply('⏸️ Paused');
  }

  if (interaction.commandName === 'resume') {
    const q = distube.getQueue(interaction.guildId);
    if (!q) return interaction.reply('❌ Nothing playing');
    q.resume();
    interaction.reply('▶️ Resumed');
  }

  if (interaction.commandName === 'leave') {
    distube.voices.leave(interaction.guild);
    interaction.reply('👋 Left VC');
  }

  if (interaction.commandName === 'queue') {
    const q = distube.getQueue(interaction.guildId);
    if (!q || !q.songs.length) return interaction.reply('❌ Empty queue');

    const list = q.songs.slice(0, 10)
      .map((s, i) => `${i + 1}. ${s.name}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor('#ffcce5')
      .setTitle('🎼 Queue')
      .setDescription(list);

    interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'nowplaying') {
    const q = distube.getQueue(interaction.guildId);
    if (!q) return interaction.reply('❌ Nothing playing');

    const song = q.songs[0];

    const embed = new EmbedBuilder()
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
