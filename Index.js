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

function createButtons(userId, isProcessing = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`start_btn_${userId}`)
            .setLabel('🚀 Start Advertising')
            .setStyle(isProcessing ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`stop_btn_${userId}`)
            .setLabel('🛑 Stop Advertising')
            .setStyle(isProcessing ? ButtonStyle.Secondary : ButtonStyle.Danger)
    );
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.guildId !== ALLOWED_GUILD_ID) return;

    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        await interaction.reply({ 
            content: `### 🤖 **PRIVATE CONTROL PANEL**\n*Status: Awaiting Setup*`, 
            components: [createButtons(interaction.user.id, false)] 
        });
    }

    if (interaction.isButton()) {
        const ownerId = interaction.customId.split('_').pop();
        
        // Security: Ensure only the panel owner can click buttons
        if (interaction.user.id !== ownerId) {
            return await interaction.reply({ content: "❌ **Access Denied.** This is not your panel.", ephemeral: true });
        }

        if (interaction.customId.startsWith('stop_btn_')) {
            const task = activeTasks.get(interaction.user.id);
            if (task) {
                clearInterval(task.interval);
                task.client.destroy();
                activeTasks.delete(interaction.user.id);
                await interaction.update({ 
                    content: `### 🤖 **PRIVATE CONTROL PANEL**\n🛑 **Advertising Stopped.**`,
                    components: [createButtons(ownerId, false)] 
                });
            } else {
                await interaction.reply({ content: "⚠️ No active task found to stop.", ephemeral: true });
            }
        }

        if (interaction.customId.startsWith('start_btn_')) {
            // Prevent creating multiple panels
            if (activeTasks.has(interaction.user.id)) {
                return await interaction.reply({ content: "⚠️ **Error:** You already have an active advertising task running.", ephemeral: true });
            }

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

    if (interaction.isModalSubmit() && interaction.customId.startsWith('adv_modal_')) {
        const ownerId = interaction.customId.split('_').pop();
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
            
            await interaction.editReply({ 
                content: `### 🤖 **PRIVATE CONTROL PANEL**\n✅ **Advertising Started!**`,
                components: [createButtons(ownerId, true)] 
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
