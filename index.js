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

const commands = [

  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play music')
    .addStringOption(option =>
      option.setName('song')
        .setDescription('Song name or URL')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip current song'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop music'),

  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause music'),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume music'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show queue'),

  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Current song'),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave VC')

].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {

    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log('Commands registered.');

  } catch (err) {
    console.error(err);
  }
})();

client.once('ready', () => {
  console.log(`${client.user.tag} online ✨`);
});

client.on('interactionCreate', async interaction => {

  if (interaction.isButton()) {

    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: '❌ No music playing.',
        ephemeral: true
      });
    }

    if (interaction.customId === 'pause') {
      queue.pause();

      return interaction.reply({
        content: '⏸️ Music paused.',
        ephemeral: true
      });
    }

    if (interaction.customId === 'resume') {
      queue.resume();

      return interaction.reply({
        content: '▶️ Music resumed.',
        ephemeral: true
      });
    }

    if (interaction.customId === 'skip') {
      queue.skip();

      return interaction.reply({
        content: '⏭️ Song skipped.',
        ephemeral: true
      });
    }

    if (interaction.customId === 'stop') {
      queue.stop();

      return interaction.reply({
        content: '🩷 Music stopped.',
        ephemeral: true
      });
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const voiceChannel = interaction.member.voice.channel;

  if (
    interaction.commandName !== 'queue' &&
    interaction.commandName !== 'nowplaying'
  ) {
    if (!voiceChannel) {
      return interaction.reply({
        content: '🌸 Join a voice channel first.',
        ephemeral: true
      });
    }
  }

  if (interaction.commandName === 'play') {

    const song = interaction.options.getString('song');

    await interaction.deferReply();

    try {

      await distube.play(voiceChannel, song, {
        textChannel: interaction.channel,
        member: interaction.member
      });

      interaction.editReply(`✨ Searching for **${song}**`);

    } catch (err) {
      console.error(err);

      interaction.editReply('❌ Could not play song.');
    }
  }

  if (interaction.commandName === 'skip') {

    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply('❌ Nothing playing.');
    }

    queue.skip();

    interaction.reply('⏭️ Song skipped.');
  }

  if (interaction.commandName === 'stop') {

    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply('❌ Nothing playing.');
    }

    queue.stop();

    interaction.reply('🩷 Music stopped.');
  }

  if (interaction.commandName === 'pause') {

    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply('❌ Nothing playing.');
    }

    queue.pause();

    interaction.reply('⏸️ Music paused.');
  }

  if (interaction.commandName === 'resume') {

    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply('❌ Nothing playing.');
    }

    queue.resume();

    interaction.reply('▶️ Music resumed.');
  }

  if (interaction.commandName === 'leave') {

    distube.voices.leave(interaction.guild);

    interaction.reply('👋 Leaving VC.');
  }

  if (interaction.commandName === 'queue') {

    const queue = distube.getQueue(interaction.guildId);

    if (!queue || !queue.songs.length) {
      return interaction.reply('❌ Queue empty.');
    }

    const songs = queue.songs
      .slice(0, 10)
      .map((song, index) =>
        `${index + 1}. ${song.name}`
      )
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor('#ffcce5')
      .setTitle('🎼 Hanami Queue')
      .setDescription(songs)
      .setFooter({
        text: `Songs: ${queue.songs.length}`
      });

    interaction.reply({
      embeds: [embed]
    });
  }

  if (interaction.commandName === 'nowplaying') {

    const queue = distube.getQueue(interaction.guildId);

    if (!queue || !queue.songs.length) {
      return interaction.reply('❌ Nothing playing.');
    }

    const song = queue.songs[0];

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('pause')
          .setEmoji('⏸️')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('resume')
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId('skip')
          .setEmoji('⏭️')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('stop')
          .setEmoji('🩷')
          .setStyle(ButtonStyle.Danger)
      );

    const embed = new EmbedBuilder()
      .setColor('#ffb6d9')
      .setTitle('🎧 Now Playing')
      .setDescription(`**${song.name}**`)
      .setURL(song.url)
      .setThumbnail(song.thumbnail)
      .addFields(
        {
          name: 'Duration',
          value: song.formattedDuration,
          inline: true
        },
        {
          name: 'Requested By',
          value: song.user.username,
          inline: true
        }
      )
      .setFooter({
        text: 'Hanami Music ✨'
      });

    interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }

});

distube.on('playSong', (queue, song) => {

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pause')
        .setEmoji('⏸️')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('resume')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('skip')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('stop')
        .setEmoji('🩷')
        .setStyle(ButtonStyle.Danger)
    );

  const embed = new EmbedBuilder()
    .setColor('#ffb6d9')
    .setTitle('🎶 Now Playing')
    .setDescription(`**${song.name}**`)
    .setURL(song.url)
    .setThumbnail(song.thumbnail)
    .addFields(
      {
        name: 'Duration',
        value: song.formattedDuration,
        inline: true
      },
      {
        name: 'Artist',
        value: song.uploader.name,
        inline: true
      }
    )
    .setFooter({
      text: 'Hanami Music ✨'
    });

  queue.textChannel.send({
    embeds: [embed],
    components: [row]
  });

});

client.login(TOKEN);
