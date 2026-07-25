const { 
    Client, 
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
require('dotenv').config();

// The main control panel interface requires a normal Bot Token to host the buttons/commands
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let advState = {
    isRunning: false,
    sentCount: 0,
    failCount: 0,
    intervalId: null,
    targetChannels: [],
    messageContent: '',
    delaySeconds: 0,
    userToken: null
};

client.once('ready', async () => {
    console.log(`Control Panel Bot logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('panel')
            .setDescription('Opens the professional advertising control panel'),
        new SlashCommandBuilder()
            .setName('adv')
            .setDescription('Manage advertisement automation')
            .addSubcommand(sub => 
                sub.setName('status').setDescription('Checks the current status of the advertisement loop')
            )
            .addSubcommand(sub => 
                sub.setName('stop').setDescription('Stops the active advertising automation loop')
            )
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully registered global slash commands.');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'panel') {
                const embed = new EmbedBuilder()
                    .setTitle('📢 Professional Advertising Control Center')
                    .setDescription('Manage your automated broadcasting using direct HTTP requests.\n\n**Instructions:**\n1. Click **Start Advertising** below.\n2. Input your **User Token**, target Channel IDs, Message content, and Delay.\n3. Use `/adv status` to track delivery performance or `/adv stop` to halt.')
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
                            { name: 'Configured Delay', value: `${advState.delaySeconds} seconds`, inline: false }
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
                .setTitle('Configure User Campaign');

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
                .setPlaceholder('Enter promotional text...')
                .setRequired(true);

            const delayInput = new TextInputBuilder()
                .setCustomId('adv_delay')
                .setLabel('Delay Between Messages (Seconds)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., 30')
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
            const message = interaction.fields.getTextInputValue('adv_message');
            const delay = parseInt(interaction.fields.getTextInputValue('adv_delay'), 10);

            if (isNaN(delay) || delay < 5) {
                return interaction.reply({ content: '❌ Invalid delay. Please specify a number >= 5 seconds.', ephemeral: true });
            }

            const channels = channelsRaw.split(',').map(id => id.trim()).filter(id => id.length > 0);
            if (channels.length === 0) {
                return interaction.reply({ content: '❌ No valid channel IDs provided.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            // Validate user token immediately via a lightweight HTTP GET request to /users/@me
            const testRes = await fetch('https://discord.com/api/v10/users/@me', {
                headers: { 'Authorization': token }
            });

            if (!testRes.ok) {
                return interaction.editReply({ content: `❌ **Token Authentication Failed:** Discord HTTP API rejected the user token (Status code: ${testRes.status}). Double check your token string.` });
            }

            const userData = await testRes.json();

            advState.isRunning = true;
            advState.sentCount = 0;
            advState.failCount = 0;
            advState.targetChannels = channels;
            advState.messageContent = message;
            advState.delaySeconds = delay;
            advState.userToken = token;

            await interaction.editReply({ 
                content: `✅ **Advertising Loop Started Successfully!**\nAuthenticated User: **${userData.username}**\nTargeting **${channels.length} channel(s)** every **${delay}s** via direct API.` 
            });

            // Start loop using direct HTTP POST requests (skips gateway websocket client checks entirely)
            advState.intervalId = setInterval(async () => {
                if (!advState.isRunning) return;

                for (const channelId of advState.targetChannels) {
                    if (!advState.isRunning) break;
                    try {
                        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                            method: 'POST',
                            headers: {
                                'Authorization': advState.userToken,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ content: advState.messageContent })
                        });

                        if (res.ok) {
                            advState.sentCount++;
                        } else {
                            advState.failCount++;
                        }
                    } catch (err) {
                        advState.failCount++;
                        console.error(`HTTP Request failed for channel ${channelId}:`, err.message);
                    }
                    
                    // Buffer to manage rate limits safely
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }, delay * 1000);
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
    if (advState.intervalId) {
        clearInterval(advState.intervalId);
        advState.intervalId = null;
    }
    advState.userToken = null;
}

client.login(process.env.DISCORD_TOKEN);
