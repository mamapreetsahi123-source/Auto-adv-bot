const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const express = require('express');

// --- 1. WEB SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is Online!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Web server on port ${port}`));

// --- 2. MAIN BOT SETUP ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const activeTasks = new Map();

client.once('ready', async () => {
    console.log(`Logged in as: ${client.user.tag}`);
    try {
        const commands = await client.application.commands.fetch();
        for (const cmd of commands.values()) {
            if (cmd.name !== 'setup') await client.application.commands.delete(cmd.id);
        }
        await client.application.commands.create({ 
            name: 'setup', 
            description: 'Open your private Advertising Panel' 
        });
        console.log('Bot is ready and commands cleaned.');
    } catch (e) { console.error(e); }
});

// Helper to create buttons locked to a specific User ID
function createButtons(userId, isProcessing = false, isStopped = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`start_btn_${userId}`)
            .setLabel('🚀 Start Advertising')
            .setStyle(isProcessing ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`stop_btn_${userId}`)
            .setLabel('🛑 Stop Advertising')
            .setStyle(isStopped ? ButtonStyle.Danger : ButtonStyle.Secondary)
    );
}

// --- 3. INTERACTION HANDLING ---
client.on('interactionCreate', async (interaction) => {
    
    // 1. Handle /setup
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        await interaction.reply({ 
            content: `### 🤖 **PRIVATE CONTROL PANEL**\nThis panel is locked to <@${interaction.user.id}>.\n*Status: Awaiting Setup*`, 
            components: [createButtons(interaction.user.id)] 
        });
    }

    // 2. Handle Buttons
    if (interaction.isButton()) {
        const isStart = interaction.customId.startsWith('start_btn_');
        const isStop = interaction.customId.startsWith('stop_btn_');
        const ownerId = interaction.customId.split('_').pop();

        if (interaction.user.id !== ownerId) {
            return await interaction.reply({ content: "❌ **Access Denied.**", ephemeral: true });
        }

        if (isStop) {
            const task = activeTasks.get(interaction.user.id);
            if (task) {
                clearInterval(task.interval);
                task.client.destroy();
                activeTasks.delete(interaction.user.id);
                // Update text to "stopped" and turn button red
                await interaction.update({ 
                    content: `### 🤖 **PRIVATE CONTROL PANEL**\n✅ **Your advertisement stopped!**`,
                    components: [createButtons(ownerId, false, true)] 
                });
            } else {
                await interaction.reply({ content: "❌ No active ads running.", ephemeral: true });
            }
        }

        if (isStart) {
            const modal = new ModalBuilder().setCustomId(`adv_modal_${ownerId}`).setTitle('Private AD Setup');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_token').setLabel('User Token').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_msg').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_delay').setLabel('Delay (sec)').setValue('60').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_channels').setLabel('Channel IDs').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            await interaction.showModal(modal);
        }
    }

    // 3. Modal Submission
    if (interaction.isModalSubmit() && interaction.customId.startsWith('adv_modal_')) {
        const ownerId = interaction.customId.split('_').pop();
        
        // Update text to "started" and turn button green
        await interaction.update({ 
            content: `### 🤖 **PRIVATE CONTROL PANEL**\n✅ **Your advertisement started!**`,
            components: [createButtons(ownerId, true, false)] 
        });

        const userToken = interaction.fields.getTextInputValue('user_token');
        const messageText = interaction.fields.getTextInputValue('adv_msg');
        const delay = parseInt(interaction.fields.getTextInputValue('adv_delay')) * 1000;
        const channelIds = interaction.fields.getTextInputValue('adv_channels').split(',').map(id => id.trim());

        const userSelfBot = new SelfClient({ checkUpdate: false });
        userSelfBot.on('ready', async () => {
            const sendAds = async () => {
                for (let id of channelIds) {
                    try {
                        const channel = await userSelfBot.channels.fetch(id);
                        if (channel) await channel.send(messageText);
                    } catch (err) { console.error(`Error: ${err.message}`); }
                }
            };
            await sendAds();
            const intervalId = setInterval(sendAds, delay);
            activeTasks.set(ownerId, { client: userSelfBot, interval: intervalId });
        });

        try { await userSelfBot.login(userToken); } 
        catch (err) { await interaction.followUp({ content: '❌ Invalid Token!', ephemeral: true }); }
    }
});

client.login(process.env.DISCORD_TOKEN);
