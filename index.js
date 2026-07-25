const { 
    Client: BotClient, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
require('dotenv').config();

const ALLOWED_GUILDS = ['1493598034544820284', '1402276801065123942'];

const controlBot = new BotClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let advState = {
    isRunning: false,
    sentCount: 0,
    failCount: 0,
    timeoutId: null,
    targetChannels: [],
    messageContent: '',
    minDelay: 0,
    maxDelay: 0,
    userToken: null,
    activeClient: null
};

// Background RAM monitor (Wispbyte 450MB auto-restart trigger)
setInterval(() => {
    const memoryUsageMB = process.memoryUsage().rss / 1024 / 1024;
    if (memoryUsageMB >= 450) {
        console.log(`[Memory Guardian] RAM usage reached ${memoryUsageMB.toFixed(2)} MB (>= 450MB limit). Restarting process to free memory...`);
        if (advState.activeClient) {
            try { advState.activeClient.destroy(); } catch {}
        }
        process.exit(0);
    }
}, 30000);

controlBot.once('ready', async () => {
    console.log(`Control Panel Bot logged in as ${controlBot.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('panel')
            .setDescription('Opens the hybrid advertising control panel'),
        new SlashCommandBuilder()
            .setName('adv')
            .setDescription('Manage advertisement automation')
            .addSubcommand(sub => 
                sub.setName('status').setDescription('Checks current status of advertisement loop')
            )
            .addSubcommand(sub => 
                sub.setName('stop').setDescription('Stops active advertising automation loop')
            )
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(controlBot.user.id), { body: commands });
        console.log('Successfully registered global slash commands.');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

controlBot.on('interactionCreate', async interaction => {
    try {
        // Restrict usage to specified guild IDs only
        if (!interaction.guildId || !ALLOWED_GUILDS.includes(interaction.guildId)) {
            if (interaction.isRepliable()) {
                return interaction.reply({ content: '❌ This bot is not authorized to be used in this server.', ephemeral: true });
            }
            return;
        }

        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'panel') {
                const embed = new EmbedBuilder()
                    .setTitle('📢 Hybrid Advertising Control Center')
                    .setDescription('Manage automated broadcasting using standard messages with initial delay.\n\n**Instructions:**\n1. Click **Start Advertising** below.\n2. Input your User Token, Channel IDs, Advertisement Message, and Delay Range.\n3. Use `/adv status` or `/adv stop`.')
                    .setColor(0x5865F2)
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_adv_modal')
                        .setLabel('Start Advertising')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🚀')
                );

                await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            } 
            else if (interaction.commandName === 'adv') {
                const sub = interaction.options.getSubcommand();
                if (sub === 'status') {
                    const statusEmbed = new EmbedBuilder()
                        .setTitle('📊 Advertisement Status Report')
                        .addFields(
                            { name: 'Status', value: advState.isRunning ? '🟢 Running' : '🔴 Stopped', inline: true },
                            { name: 'Messages Sent', value: `${advState.sentCount}`, inline: true },
                            { name: 'Failed Attempts', value: `${advState.failCount}`, inline: true },
                            { name: 'Delay Range', value: `${advState.minDelay}s - ${advState.maxDelay}s`, inline: false }
                        )
                        .setColor(advState.isRunning ? 0x57F287 : 0xED4245)
                        .setTimestamp();

                    await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
                } 
                else if (sub === 'stop') {
                    if (!advState.isRunning) {
                        return interaction.reply({ content: '⚠️ Advertising automation is not currently running.', ephemeral: true });
                    }
                    stopAutomation();
                    await interaction.reply({ content: '🛑 Advertising automation has been successfully terminated.', ephemeral: true });
                }
            }
        }
        else if (interaction.isButton() && interaction.customId === 'open_adv_modal') {
            const modal = new ModalBuilder()
                .setCustomId('adv_config_modal')
                .setTitle('Configure Advertising Campaign');

            const tokenInput = new TextInputBuilder()
                .setCustomId('adv_token')
                .setLabel('Discord User Token')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Paste user token here...')
                .setRequired(true);

            const channelsInput = new TextInputBuilder()
                .setCustomId('adv_channels')
                .setLabel('Channel IDs (Comma separated)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('123456789012345678, 876543210987654321')
                .setRequired(true);

            const messageInput = new TextInputBuilder()
                .setCustomId('adv_message')
                .setLabel('Advertisement Message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Type your advertisement message here...')
                .setRequired(true);

            const delayInput = new TextInputBuilder()
                .setCustomId('adv_delay')
                .setLabel('Delay Range (Min-Max Seconds, e.g. 30-60)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('30-60')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(tokenInput),
                new ActionRowBuilder().addComponents(channelsInput),
                new ActionRowBuilder().addComponents(messageInput),
                new ActionRowBuilder().addComponents(delayInput)
            );

            await interaction.showModal(modal);
        }
        else if (interaction.isModalSubmit() && interaction.customId === 'adv_config_modal') {
            if (advState.isRunning) {
                return interaction.reply({ content: '⚠️ An advertising process is already active. Stop it first using `/adv stop`.', ephemeral: true });
            }

            const token = interaction.fields.getTextInputValue('adv_token').trim().replace(/^["'](.+)["']$/, '$1');
            const channelsRaw = interaction.fields.getTextInputValue('adv_channels');
            const messageContent = interaction.fields.getTextInputValue('adv_message');
            const delayRaw = interaction.fields.getTextInputValue('adv_delay').trim();

            let min = 30, max = 60;
            if (delayRaw.includes('-')) {
                const parts = delayRaw.split('-').map(p => parseInt(p.trim(), 10));
                if (!isNaN(parts[0]) && !isNaN(parts[1])) {
                    min = parts[0];
                    max = parts[1];
                }
            } else {
                const val = parseInt(delayRaw, 10);
                if (!isNaN(val)) min = max = val;
            }

            if (min < 15 || max < min) {
                return interaction.reply({ content: '❌ Invalid delay range. Minimum must be at least 15 seconds.', ephemeral: true });
            }

            const channels = channelsRaw.split(',').map(id => id.trim()).filter(id => id.length > 0);
            if (channels.length === 0) {
                return interaction.reply({ content: '❌ No valid channel IDs provided.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const userClient = new SelfbotClient({ checkUpdate: false });

            userClient.once('ready', async () => {
                advState.isRunning = true;
                advState.sentCount = 0;
                advState.failCount = 0;
                advState.targetChannels = channels;
                advState.messageContent = messageContent;
                advState.minDelay = min;
                advState.maxDelay = max;
                advState.userToken = token;
                advState.activeClient = userClient;

                const initialDelaySecs = Math.floor(Math.random() * (max - min + 1)) + min;

                await interaction.editReply({ 
                    content: `✅ **Campaign Initialized!**\nUser: **${userClient.user.tag}**\nTargeting **${channels.length} channel(s)**.\n⏳ First broadcast scheduled after an initial delay of **${initialDelaySecs} seconds**.` 
                });

                const runLoop = async () => {
                    if (!advState.isRunning) return;

                    for (const channelId of advState.targetChannels) {
                        if (!advState.isRunning) break;
                        try {
                            const channel = await userClient.channels.fetch(channelId).catch(() => null);
                            if (!channel) {
                                advState.failCount++;
                                continue;
                            }

                            const typingDuration = Math.min(Math.max(advState.messageContent.length * 80, 2000), 7000);

                            await channel.sendTyping().catch(() => {});
                            await new Promise(resolve => setTimeout(resolve, typingDuration));

                            await channel.send(advState.messageContent);
                            advState.sentCount++;
                        } catch (err) {
                            advState.failCount++;
                            console.error(`Execution error on channel ${channelId}:`, err.message);
                        }

                        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 3000) + 2000));
                    }

                    if (advState.isRunning) {
                        const randomDelaySecs = Math.floor(Math.random() * (advState.maxDelay - advState.minDelay + 1)) + advState.minDelay;
                        advState.timeoutId = setTimeout(runLoop, randomDelaySecs * 1000);
                    }
                };

                // Respect initial delay before running the first cycle
                advState.timeoutId = setTimeout(runLoop, initialDelaySecs * 1000);
            });

            userClient.login(token).catch(async (err) => {
                await interaction.editReply({ content: `❌ **Token Login Failed:** Could not authenticate user token via gateway (${err.message}).` }).catch(() => {});
            });
        }
    } catch (error) {
        console.error('Interaction error:', error);
        if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({ content: 'An unexpected error occurred.', ephemeral: true }).catch(() => {});
        }
    }
});

function stopAutomation() {
    advState.isRunning = false;
    if (advState.timeoutId) {
        clearTimeout(advState.timeoutId);
        advState.timeoutId = null;
    }
    if (advState.activeClient) {
        try {
            advState.activeClient.destroy();
        } catch {}
        advState.activeClient = null;
    }
    advState.userToken = null;
}

controlBot.login(process.env.DISCORD_TOKEN);
