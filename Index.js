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
        // ONLY register /setup
        await client.application.commands.create({ name: 'setup', description: 'Open Advertising Panel' });
        console.log('Setup command registered.');
    } catch (e) { console.error(e); }
});

// Helper to create the panel buttons
function createButtons(isProcessing = false, isStopped = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('start_btn')
            .setLabel('🚀 Start Advertising')
            .setStyle(isProcessing ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('stop_btn')
            .setLabel('🛑 Stop Advertising')
            .setStyle(isStopped ? ButtonStyle.Danger : ButtonStyle.Secondary)
    );
}

// --- 3. INTERACTION HANDLING ---
client.on('interactionCreate', async (interaction) => {
    
    // 1. Handle /setup command
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        await interaction.reply({ 
            content: "### 🤖 **ADVERTISING CONTROL PANEL**\nUse the buttons below to manage your account.", 
            components: [createButtons()] 
        });
    }

    // 2. Handle Button Clicks
    if (interaction.isButton()) {
        // STOP BUTTON
        if (interaction.customId === 'stop_btn') {
            const task = activeTasks.get(interaction.user.id);
            if (task) {
                clearInterval(task.interval);
                task.client.destroy();
                activeTasks.delete(interaction.user.id);
                // Turn stop button red and start button back to blue
                await interaction.update({ components: [createButtons(false, true)] });
            } else {
                await interaction.reply({ content: "❌ No active ads running.", ephemeral: true });
            }
        }

        // START BUTTON (Open Modal)
        if (interaction.customId === 'start_btn') {
            const modal = new ModalBuilder().setCustomId('adv_modal').setTitle('AD Setup');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_token').setLabel('User Token').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_msg').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_delay').setLabel('Delay (sec)').setValue('60').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_channels').setLabel('Channel IDs').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            await interaction.showModal(modal);
        }
    }

    // 3. Modal Submission (The Engine)
    if (interaction.isModalSubmit() && interaction.customId === 'adv_modal') {
        // Change Start button to Green on the panel
        await interaction.update({ components: [createButtons(true, false)] });

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
                    } catch (err) { console.error(err.message); }
                }
            };
            await sendAds(); // Send immediately
            const intervalId = setInterval(sendAds, delay);
            activeTasks.set(interaction.user.id, { client: userSelfBot, interval: intervalId });
        });

        try { await userSelfBot.login(userToken); } 
        catch (err) { await interaction.followUp({ content: '❌ Invalid Token!', ephemeral: true }); }
    }
});

client.login(process.env.DISCORD_TOKEN);
