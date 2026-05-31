const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, ActivityType } = require('discord.js');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Your Custom Adv Bot is Online!'));

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // Set permanent custom status
    client.user.setActivity({
        type: ActivityType.Custom,
        name: "custom_status",
        state: "Genghis Khan"
    });

    // Register the global /setup slash command dynamically
    try {
        await client.application.commands.create({
            name: 'setup',
            description: 'Open your personal auto advertisement setup panel'
        });
        console.log('Successfully registered /setup slash command global.');
    } catch (error) {
        console.error('Error registering slash command:', error);
    }
});

// Handle the /setup Slash Command instead of text commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup') {
        // Embed the runner's ID into the Custom ID to lock this specific button down to them
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`start_adv_btn_${interaction.user.id}`)
                .setLabel('🚀 Start Advertisement')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({
            content: "🤖 **AUTO ADVERTISEMENT SYSTEM**\n-------------------------\n\n🚀 **HOW IT WORKS:**\n\n1. Hit the Start button\n2. Paste your token without \" \"\n3. Write your message\n4. Pick a delay (seconds)\n5. Add channel IDs or links (comma separated)\n6. Type CONFIRM\n\n🎮 **COMMANDS:**\n`/adv-stop` - Stop spamming\n`/adv-status` - See your stats\n\n💡 **EXAMPLE:**\nChannels: 123456789,987654321,555555555\nDelay: 10 seconds",
            components: [row]
        });
    }
});

// Handle Button Pushes and Modal Submissions securely
client.on('interactionCreate', async (interaction) => {
    // Check if a user clicked the advertisement button
    if (interaction.isButton() && interaction.customId.startsWith('start_adv_btn_')) {
        // Extract the original command executor's ID from the custom ID structure
        const allowedUserId = interaction.customId.replace('start_adv_btn_', '');

        // If the user clicking isn't the owner of the panel, reject them immediately
        if (interaction.user.id !== allowedUserId) {
            return await interaction.reply({
                content: "❌ This setup panel is not yours! Type `/setup` to generate your own personal interface.",
                ephemeral: true // Only they can see this rejection window
            });
        }

        const modal = new ModalBuilder()
            .setCustomId('adv_modal')
            .setTitle('Auto ADV Setup');

        const tokenInput = new TextInputBuilder()
            .setCustomId('user_token')
            .setLabel('Your Discord User Token')
            .setPlaceholder('ND... or M...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const msgInput = new TextInputBuilder()
            .setCustomId('adv_msg')
            .setLabel('Message to spam')
            .setPlaceholder('Enter your advertisement message')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const delayInput = new TextInputBuilder()
            .setCustomId('adv_delay')
            .setLabel('Delay (seconds)')
            .setValue('5')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const channelsInput = new TextInputBuilder()
            .setCustomId('adv_channels')
            .setLabel('Channel IDs or Links (comma separated)')
            .setPlaceholder('123456789, https://discord.com/channels/... ')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(tokenInput),
            new ActionRowBuilder().addComponents(msgInput),
            new ActionRowBuilder().addComponents(delayInput),
            new ActionRowBuilder().addComponents(channelsInput)
        );

        await interaction.showModal(modal);
    }

    // Process the form contents when submitted
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'adv_modal') {
        const userToken = interaction.fields.getTextInputValue('user_token');
        const messageText = interaction.fields.getTextInputValue('adv_msg');
        
        await interaction.reply({ 
            content: `⏳ Processing request configuration securely...`, 
            ephemeral: true 
        });
        
        console.log(`Received configurations for user ${interaction.user.id}`);
    }
});

client.login(process.env.DISCORD_TOKEN);
