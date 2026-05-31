const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const express = require('express');

// --- 1. WEB SERVER FOR RENDER ---
const app = express();
app.get('/', (req, res) => res.send('Bot is Online!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Web server on port ${port}`));

// --- 2. MAIN BOT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent 
    ]
});

const activeTasks = new Map();

client.once('ready', async () => {
    console.log(`Logged in as Official Bot: ${client.user.tag}`);
    try {
        await client.application.commands.create({ name: 'setup', description: 'Start advertising' });
        await client.application.commands.create({ name: 'stop', description: 'Stop advertising' });
        console.log('Commands registered.');
    } catch (e) { console.error(e); }
});

// --- 3. INTERACTION HANDLING ---
client.on('interactionCreate', async (interaction) => {
    
    // Handle Slash Command /setup
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`start_btn_${interaction.user.id}`)
                .setLabel('🚀 Start Advertisement')
                .setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ content: "### 🤖 **AD SYSTEM**\nClick start to begin.", components: [row] });
    }

    // Handle Slash Command /stop
    if (interaction.isChatInputCommand() && interaction.commandName === 'stop') {
        const task = activeTasks.get(interaction.user.id);
        if (task) {
            clearInterval(task.interval);
            task.client.destroy();
            activeTasks.delete(interaction.user.id);
            await interaction.reply({ content: "🛑 **Stopped!** Your ads have been shut down.", ephemeral: true });
        } else {
            await interaction.reply({ content: "❌ No active ads found.", ephemeral: true });
        }
    }

    // Handle Button Click
    if (interaction.isButton() && interaction.customId.startsWith('start_btn_')) {
        if (interaction.user.id !== interaction.customId.replace('start_btn_', '')) {
            return await interaction.reply({ content: "❌ Not your panel!", ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('adv_modal').setTitle('Auto ADV Setup');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_token').setLabel('User Token').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_msg').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_delay').setLabel('Delay (seconds)').setValue('60').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_channels').setLabel('Channel IDs (comma separated)').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        await interaction.showModal(modal);
    }

    // --- 4. MODAL SUBMISSION ---
    if (interaction.isModalSubmit() && interaction.customId === 'adv_modal') {
        
        // CHANGED THIS MESSAGE AS REQUESTED
        await interaction.reply({ content: '✅ **Your advertising started!**', ephemeral: true });

        const userToken = interaction.fields.getTextInputValue('user_token');
        const messageText = interaction.fields.getTextInputValue('adv_msg');
        const delay = parseInt(interaction.fields.getTextInputValue('adv_delay')) * 1000;
        const channelIds = interaction.fields.getTextInputValue('adv_channels').split(',').map(id => id.trim());

        const userSelfBot = new SelfClient({ checkUpdate: false });

        userSelfBot.on('ready', () => {
            console.log(`Success: Loop started for ${userSelfBot.user.tag}`);
            const intervalId = setInterval(async () => {
                for (let id of channelIds) {
                    try {
                        const channel = await userSelfBot.channels.fetch(id);
                        if (channel) await channel.send(messageText);
                    } catch (err) { console.error(`Error: ${err.message}`); }
                }
            }, delay);
            activeTasks.set(interaction.user.id, { client: userSelfBot, interval: intervalId });
        });

        try { await userSelfBot.login(userToken); } 
        catch (err) { await interaction.followUp({ content: '❌ Invalid Token!', ephemeral: true }); }
    }
});

client.login(process.env.DISCORD_TOKEN);
