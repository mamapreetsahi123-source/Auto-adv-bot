const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType 
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const express = require('express');

const ALLOWED_GUILD_ID = '1493598034544820284'; 

const app = express();
app.get('/', (req, res) => res.send('Bot is Online!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Web server on port ${port}`));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const activeTasks = new Map();

client.once('ready', async () => {
    console.log(`Logged in as: ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: 'GENGHIS KHAN', type: ActivityType.Playing }],
        status: 'online',
    });
});

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

client.on('interactionCreate', async (interaction) => {
    if (interaction.guildId !== ALLOWED_GUILD_ID) return;

    // Handle /setup
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        await interaction.reply({ 
            content: `### 🤖 **PRIVATE CONTROL PANEL**\n*Status: Awaiting Setup*`, 
            components: [createButtons(interaction.user.id)] 
        });
    }

    // Handle Buttons
    if (interaction.isButton()) {
        const ownerId = interaction.customId.split('_').pop();
        if (interaction.user.id !== ownerId) return;

        if (interaction.customId.startsWith('stop_btn_')) {
            const task = activeTasks.get(interaction.user.id);
            if (task) {
                clearInterval(task.interval);
                task.client.destroy();
                activeTasks.delete(interaction.user.id);
                await interaction.reply({ content: `✅ **Stopped!**`, ephemeral: true });
            }
        }

        if (interaction.customId.startsWith('start_btn_')) {
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

    // Modal Submission - THE FIX IS HERE
    if (interaction.isModalSubmit() && interaction.customId.startsWith('adv_modal_')) {
        const ownerId = interaction.customId.split('_').pop();
        
        // 1. Immediately acknowledge the interaction
        await interaction.deferUpdate(); 

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
            
            // 2. Update the existing message
            await interaction.editReply({ 
                content: `### 🤖 **PRIVATE CONTROL PANEL**\n✅ **Started!**`,
                components: [createButtons(ownerId, true, false)] 
            });
        });

        try { await userSelfBot.login(userToken); } 
        catch (err) { 
            activeTasks.delete(ownerId);
            await interaction.followUp({ content: '❌ Invalid Token!', ephemeral: true }); 
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
