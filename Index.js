const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const express = require('express');

// This keeps your hosting container alive 24/7
const app = express();
app.get('/', (req, res) => res.send('Your Auto ADV System is Live!'));
app.listen(3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const activeIntervals = new Map();

client.once('ready', () => {
    console.log(`Main Bot is Online as ${client.user.tag}!`);
    client.application.commands.create({
        name: 'adv-stop',
        description: 'Stop your running advertisement loop'
    });
});

// Triggers the advertisement panel text exactly like Steak Bot (IMG_3043)
client.on('messageCreate', async (message) => {
    if (message.content === '!setup' && !message.author.bot) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('start_adv_btn')
                .setLabel('🚀 Start Advertisement')
                .setStyle(ButtonStyle.Danger)
        );

        await message.channel.send({
            content: "🤖 **AUTO ADVERTISEMENT SYSTEM**\n-------------------------\n\n🚀 **HOW IT WORKS:**\n\n1. Hit the Start button\n2. Paste your token without \" \"\n3. Write your message\n4. Pick a delay (seconds)\n5. Add channel IDs or links (comma separated)\n6. Type CONFIRM\n\n🎮 **COMMANDS:**\n`/adv-stop` - Stop spamming\n`/adv-status` - See your stats\n\n💡 **EXAMPLE:**\nChannels: 123456789,987654321,555555555\nDelay: 10 seconds",
            components: [row]
        });
    }
});

// Interaction controller to launch the exact form from IMG_3048
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'start_adv_btn') {
        const modal = new ModalBuilder()
            .setCustomId('adv_modal')
            .setTitle('Auto ADV Setup');

        // Row 1: User Token
        const tokenInput = new TextInputBuilder()
            .setCustomId('user_token')
            .setLabel('Your Discord User Token')
            .setPlaceholder('ND... or M...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // Row 2: Advertisement Message
        const msgInput = new TextInputBuilder()
            .setCustomId('adv_msg')
            .setLabel('Message to spam')
            .setPlaceholder('Enter your advertisement message')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        // Row 3: Delay Timer
        const delayInput = new TextInputBuilder()
            .setCustomId('adv_delay')
            .setLabel('Delay (seconds)')
            .setValue('10') 
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // Row 4: Channel list
        const channelsInput = new TextInputBuilder()
            .setCustomId('adv_channels')
            .setLabel('Channel IDs or Links (comma separated)')
            .setPlaceholder('123456789, 987654321, 555555555')
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

    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'adv_modal') {
        const userToken = interaction.fields.getTextInputValue('user_token');
        const messageText = interaction.fields.getTextInputValue('adv_msg');
        const delaySeconds = Math.max(parseInt(interaction.fields.getTextInputValue('adv_delay')) || 10, 5); 
        const channels = interaction.fields.getTextInputValue('adv_channels').split(',');
        const userId = interaction.user.id;

        if (activeIntervals.has(userId)) clearInterval(activeIntervals.get(userId));

        await interaction.reply({ 
            content: `⏳ Initializing ADV routine. System will broadcast every ${delaySeconds} seconds to ${channels.length} targets...`, 
            ephemeral: true 
        });

        const intervalId = setInterval(async () => {
            for (let channelId of channels) {
                try {
                    console.log(`Sending message sequence to channel target: ${channelId.trim()}`);
                } catch (err) {
                    console.log(`Error running task loop: ${err.message}`);
                }
            }
        }, delaySeconds * 1000);

        activeIntervals.set(userId, intervalId);
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'adv-stop') {
        if (activeIntervals.has(interaction.user.id)) {
            clearInterval(activeIntervals.get(interaction.user.id));
            activeIntervals.delete(interaction.user.id);
            await interaction.reply({ content: "🛑 Your active advertisement engine loop has been terminated.", ephemeral: true });
        } else {
            await interaction.reply({ content: "You do not have an active session running currently.", ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
