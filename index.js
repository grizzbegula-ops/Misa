const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior
} = require('@discordjs/voice');

const play = require('play-dl');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = createAudioPlayer({
  behaviors: {
    noSubscriber: NoSubscriberBehavior.Pause,
  },
});

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song')
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
    .setDescription('Stop the music')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();

client.once('ready', () => {
  console.log(`${client.user.tag} is online.`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'play') {
    const query = interaction.options.getString('song');

    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '🌸 Join a voice channel first.',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      const search = await play.search(query, {
        limit: 1
      });

      if (!search.length) {
        return interaction.editReply('❌ No results found.');
      }

      const song = search[0];

      const stream = await play.stream(song.url);

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });

      player.play(resource);
      connection.subscribe(player);

      const embed = new EmbedBuilder()
        .setTitle('🎶 Now Playing')
        .setDescription(`**${song.title}**`)
        .setURL(song.url)
        .setThumbnail(song.thumbnails[0].url)
        .addFields(
          {
            name: 'Duration',
            value: song.durationRaw || 'Unknown',
            inline: true
          },
          {
            name: 'Channel',
            value: song.channel.name,
            inline: true
          }
        )
        .setFooter({ text: 'Hanami Music ✨' })
        .setTimestamp();

      interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      interaction.editReply('❌ Error playing the song.');
    }
  }

  if (interaction.commandName === 'skip') {
    player.stop();
    interaction.reply('⏭️ Skipped the song.');
  }

  if (interaction.commandName === 'stop') {
    player.stop();
    interaction.reply('🩷 Music stopped.');
  }
});

client.login(TOKEN);
