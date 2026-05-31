const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    InteractionType 
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const express = require('express');

// --- 1. WEB SERVER FOR RENDER ---
const app = express();
app.get('/', (req, res) => res.send('Auto Adv Bot is Online!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Web server listening on port ${port}`));

// --- 2. MAIN BOT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent 
    ]
});

// Store active advertisement tasks
const activeTasks = new Map();

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // Register global slash command
    try {
        await client.application.commands.create({
            name: 'setup',
            description: 'Open your personal auto advertisement setup panel'
        });
        console.log('Successfully registered /setup slash command.');
    } catch (error) {
        console.error('Error registering slash command:', error);
    }
});

// --- 3. INTERACTION HANDLING ---
client.on('interactionCreate', async (interaction) => {
    
    // Handle Slash Command /setup
    if (interaction.isChatInput() && interaction.commandName === 'setup') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`start_adv_btn_${interaction.user.id}`)
                .setLabel('🚀 Start Advertisement')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({
            content: "### 🤖 **AUTO ADVERTISEMENT SYSTEM**\n" +
                     "1. Hit the Start button\n2. Paste your token\n3. Set your message\n4. Set delay",
            components: [row]
        });
    }

    // Handle Button Click
    if (interaction.isButton() && interaction.customId.startsWith('start_adv_btn_')) {
        const allowedUserId = interaction.customId.replace('start_adv_btn_', '');
        
        if (interaction.user.id !== allowedUserId) {
            return await interaction.reply({ content: "❌ This setup isn't yours!", ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId('adv_modal')
            .setTitle('Auto ADV Setup');

        const tokenInput = new TextInputBuilder()
            .setCustomId('user_token').setLabel('Your Discord User Token').setStyle(TextInputStyle.Short).setRequired(true);
        const msgInput = new TextInputBuilder()
            .setCustomId('adv_msg').setLabel('Message to send').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const delayInput = new TextInputBuilder()
            .setCustomId('adv_delay').setLabel('Delay (seconds)').setValue('60').setStyle(TextInputStyle.Short).setRequired(true);
        const channelsInput = new TextInputBuilder()
            .setCustomId('adv_channels').setLabel('Channel IDs (comma separated)').setStyle(TextInputStyle.Paragraph).setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(tokenInput),
            new ActionRowBuilder().addComponents(msgInput),
            new ActionRowBuilder().addComponents(delayInput),
            new ActionRowBuilder().addComponents(channelsInput)
        );

        await interaction.showModal(modal);
    }

    // --- 4. THE MESSAGE SENDING ENGINE ---
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'adv_modal') {
        const userToken = interaction.fields.getTextInputValue('user_token');
        const messageText = interaction.fields.getTextInputValue('adv_msg');
        const delay = parseInt(interaction.fields.getTextInputValue('adv_delay')) * 1000;
        const channelIds = interaction.fields.getTextInputValue('adv_channels').split(',');

        await interaction.reply({ content: '⏳ Starting your advertisement engine...', ephemeral: true });

        // Initialize the Self-Bot client for the user
        const userSelfBot = new SelfClient({ checkUpdate: false });

        userSelfBot.on('ready', () => {
            console.log(`Automation started for user: ${userSelfBot.user.tag}`);
            
            const intervalId = setInterval(async () => {
                for (let id of channelIds) {
                    try {
                        const channel = await userSelfBot.channels.fetch(id.trim());
                        if (channel) await channel.send(messageText);
                    } catch (err) {
                        console.error(`Failed to send to ${id}:`, err.message);
                    }
                }
            }, delay);

            activeTasks.set(interaction.user.id, { client: userSelfBot, interval: intervalId });
        });

        try {
            await userSelfBot.login(userToken);
        } catch (err) {
            await interaction.followUp({ content: '❌ Invalid Token provided.', ephemeral: true });
        }
    }
});

// --- 5. STOP COMMAND ---
client.on('messageCreate', async (msg) => {
    if (msg.content === '/adv-stop') {
        const task = activeTasks.get(msg.author.id);
        if (task) {
            clearInterval(task.interval);
            task.client.destroy();
            activeTasks.delete(msg.author.id);
            msg.reply("🛑 Advertisement stopped successfully.");
        } else {
            msg.reply("You have no active advertisements running.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
