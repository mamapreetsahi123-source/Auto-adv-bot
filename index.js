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
const fs = require('fs');
const path = require('path');

const ALLOWED_GUILDS = ['1493598034544820284', '1402276801065123942'];
const CONFIG_FILE = path.join(__dirname, 'campaign_config.json');

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

function saveCampaignConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Failed to save campaign config:', err);
    }
}

function loadCampaignConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Failed to load campaign config:', err);
    }
    return null;
}

// Background RAM monitor (Wispbyte 450MB auto-restart trigger)
setInterval(() => {
    const memoryUsageMB = process.memoryUsage().rss / 1024 / 1024;
    if (memoryUsageMB >= 450) {
        console.log(`[Memory Guardian] RAM usage reached ${memoryUsageMB.toFixed(2)} MB. Restarting process...`);
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

    const savedConfig = loadCampaignConfig();
    if (savedConfig && savedConfig.isRunning && savedConfig.userToken) {
        console.log('[Auto-Resume] Restoring active campaign session with pre-flight stabilization...');
        
        advState.targetChannels = savedConfig.targetChannels;
        advState.messageContent = savedConfig.messageContent;
        advState.minDelay = savedConfig.minDelay;
        advState.maxDelay = savedConfig.maxDelay;
        advState.userToken = savedConfig.userToken;

        const userClient = new SelfbotClient({ checkUpdate: false });

        userClient.once('ready', async () => {
            advState.isRunning = true;
            advState.sentCount = savedConfig.sentCount || 0;
            advState.failCount = savedConfig.failCount || 0;
            advState.activeClient = userClient;

            console.log(`[Auto-Resume] Logged in as ${userClient.user.tag}. Stabilizing session before first send...`);

            // Mandatory stabilization buffer: Let the session breathe for 10 seconds before starting loops
            await new Promise(resolve => setTimeout(resolve, 10000));

            const initialDelaySecs = Math.floor(Math.random() * (advState.maxDelay - advState.minDelay + 1)) + advState.minDelay;

            const runLoop = async () => {
                if (!advState.isRunning) return;

                if (advState.sentCount >= 30) {
                    console.log('[Safety Cool-down] Reached batch limit. Taking a 25-minute break...');
                    await new Promise(resolve => setTimeout(resolve, 25 * 60 * 1000));
                    advState.sentCount = 0;
                }

                for (const channelId of advState.targetChannels) {
                    if (!advState.isRunning) break;
                    try {
                        const channel = await userClient.channels.fetch(channelId).catch(() => null);
                        if (!channel) {
                            advState.failCount++;
                            continue;
                        }

                        // Extended human-like typing simulation to avoid instant-send triggers
                        const typingDuration = Math.min(Math.max(advState.messageContent.length * 120, 4000), 10000);

                        await channel.sendTyping().catch(() => {});
                        await new Promise(resolve => setTimeout(resolve, typingDuration));

                        const dynamicTokens = [' ', '  ', '\u200B', '\u200C', '\u200D'];
                        const randomVariant = dynamicTokens[Math.floor(Math.random() * dynamicTokens.length)];
                        const finalPayload = advState.messageContent + randomVariant;

                        await channel.send(finalPayload);
                        advState.sentCount++;
                        
                        saveCampaignConfig({ ...savedConfig, sentCount: advState.sentCount, failCount: advState.failCount });
                    } catch (err) {
                        advState.failCount++;
                        console.error(`Execution error on channel ${channelId}:`, err.message);
                    }

                    // Pacing gap between individual channels (7 to 14 seconds)
                    const channelBuffer = Math.floor(Math.random() * 7000) + 7000;
                    await new Promise(resolve => setTimeout(resolve, channelBuffer));
                }

                if (advState.isRunning) {
                    const randomDelaySecs = Math.floor(Math.random() * (advState.maxDelay - advState.minDelay + 1)) + advState.minDelay;
                    advState.timeoutId = setTimeout(runLoop, randomDelaySecs * 1000);
                }
            };

            advState.timeoutId = setTimeout(runLoop, initialDelaySecs * 1000);
        });

        userClient.login(savedConfig.userToken).catch((err) => {
            console.error(`[Auto-Resume] Failed to log in saved user token: ${err.message}`);
        });
    }
});

controlBot.on('interactionCreate', async interaction => {
    try {
        if (!interaction.guildId || !ALLOWED_GUILDS.includes(interaction.guildId)) {
            if (interaction.isRepliable()) {
                return interaction.reply({ content: '❌ This bot is not authorized to be used in this server.', ephemeral: true });
            }
            return;
        }

        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'panel') {
                const embed = new EmbedBuilder()
                    .setTitle('📢 Protected Advertising Control Center')
                    .setDescription('Manage automated broadcasting with session stabilization and pre-flight buffering.\n\n**Instructions:**\n1. Click **Start Advertising** below.\n2. Input your User Token, Channel IDs, Message, and Delay Range.\n3. Use `/adv status` or `/adv stop`.')
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
                .setTitle('Configure Protected Campaign');

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
                .setLabel('Delay Range (Min-Max Seconds, e.g. 90-180)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('90-180')
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

            let min = 90, max = 180;
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

            if (min < 60 || max < min) {
                return interaction.reply({ content: '❌ Minimum delay must be at least 60 seconds for safety.', ephemeral: true });
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

                saveCampaignConfig({
                    isRunning: true,
                    targetChannels: channels,
                    messageContent: messageContent,
                    minDelay: min,
                    maxDelay: max,
                    userToken: token,
                    sentCount: 0,
                    failCount: 0
                });

                // Pre-flight stabilization buffer on fresh manual start (10 seconds)
                await new Promise(resolve => setTimeout(resolve, 10000));

                const initialDelaySecs = Math.floor(Math.random() * (max - min + 1)) + min;

                await interaction.editReply({ 
                    content: `🛡️ **Protected Campaign Initialized!**\nUser: **${userClient.user.tag}**\nTargeting **${channels.length} channel(s)** with session stabilization.\n⏳ First broadcast scheduled after **${initialDelaySecs} seconds**.` 
                });

                const runLoop = async () => {
                    if (!advState.isRunning) return;

                    if (advState.sentCount >= 30) {
                        console.log('[Safety Cool-down] Reached message batch limit. Taking a 25-minute break...');
                        await new Promise(resolve => setTimeout(resolve, 25 * 60 * 1000));
                        advState.sentCount = 0;
                    }

                    for (const channelId of advState.targetChannels) {
                        if (!advState.isRunning) break;
                        try {
                            const channel = await userClient.channels.fetch(channelId).catch(() => null);
                            if (!channel) {
                                advState.failCount++;
                                continue;
                            }

                            const typingDuration = Math.min(Math.max(advState.messageContent.length * 120, 4000), 10000);

                            await channel.sendTyping().catch(() => {});
                            await new Promise(resolve => setTimeout(resolve, typingDuration));

                            const dynamicTokens = [' ', '  ', '\u200B', '\u200C', '\u200D'];
                            const randomVariant = dynamicTokens[Math.floor(Math.random() * dynamicTokens.length)];
                            const finalPayload = advState.messageContent + randomVariant;

                            await channel.send(finalPayload);
                            advState.sentCount++;
                            
                            const currentCfg = loadCampaignConfig();
                            if (currentCfg) {
                                saveCampaignConfig({ ...currentCfg, sentCount: advState.sentCount, failCount: advState.failCount });
                            }
                        } catch (err) {
                            advState.failCount++;
                            console.error(`Execution error on channel ${channelId}:`, err.message);
                        }

                        const channelBuffer = Math.floor(Math.random() * 7000) + 7000;
                        await new Promise(resolve => setTimeout(resolve, channelBuffer));
                    }

                    if (advState.isRunning) {
                        const randomDelaySecs = Math.floor(Math.random() * (advState.maxDelay - advState.minDelay + 1)) + advState.minDelay;
                        advState.timeoutId = setTimeout(runLoop, randomDelaySecs * 1000);
                    }
                };

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

    if (fs.existsSync(CONFIG_FILE)) {
        try { fs.unlinkSync(CONFIG_FILE); } catch {}
    }
}

controlBot.login(process.env.DISCORD_TOKEN);
