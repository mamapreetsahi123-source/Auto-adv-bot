const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const express = require('express');

// Keep the service alive on Render
const app = express();
app.get('/', (req, res) => res.send('Bot is Online!'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const activeTasks = new Map();

client.once('ready', () => {
    console.log(`Bot Ready: ${client.user.tag}`);
});

function createButtons(userId, isProcessing = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`start_btn_${userId}`)
            .setLabel('🚀 Start')
            .setStyle(isProcessing ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(isProcessing),
        new ButtonBuilder()
            .setCustomId(`stop_btn_${userId}`)
            .setLabel('🛑 Stop')
            .setStyle(isProcessing ? ButtonStyle.Danger : ButtonStyle.Secondary)
            .setDisabled(!isProcessing)
    );
}

client.on('interactionCreate', async (interaction) => {
    // 1. Handle Slash Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        await interaction.reply({ 
            content: `### 🤖 **Control Panel**`, 
            components: [createButtons(interaction.user.id, false)] 
        });
    }

    // 2. Handle Buttons
    if (interaction.isButton()) {
        const userId = interaction.customId.split('_').pop();
        if (interaction.user.id !== userId) return interaction.reply({ content: "❌ Not yours.", ephemeral: true });

        if (interaction.customId.startsWith('stop_btn_')) {
            await interaction.deferUpdate(); // Acknowledge STOP button
            const task = activeTasks.get(userId);
            if (task) {
                clearInterval(task.interval);
                task.client.destroy();
                activeTasks.delete(userId);
                await interaction.editReply({ 
                    content: `🛑 **Stopped.**`, 
                    components: [createButtons(userId, false)] 
                });
            }
        }

        if (interaction.customId.startsWith('start_btn_')) {
            // DO NOT defer/reply here. Modals must be the first response.
            const modal = new ModalBuilder().setCustomId(`adv_modal_${userId}`).setTitle('Advertising Setup');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('token').setLabel('User Token').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delay').setLabel('Delay (sec)').setValue('60').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channels').setLabel('Channel IDs (comma separated)').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            return interaction.showModal(modal);
        }
    }

    // 3. Handle Modal Submission
    if (interaction.isModalSubmit() && interaction.customId.startsWith('adv_modal_')) {
        const userId = interaction.customId.split('_').pop();
        await interaction.deferUpdate(); // Acknowledge modal submission

        const token = interaction.fields.getTextInputValue('token');
        const msg = interaction.fields.getTextInputValue('msg');
        const delay = parseInt(interaction.fields.getTextInputValue('delay')) * 1000;
        const channels = interaction.fields.getTextInputValue('channels').split(',').map(id => id.trim());

        const userSelfBot = new SelfClient({ checkUpdate: false });
        
        userSelfBot.once('ready', async () => {
            const sendAds = async () => {
                for (let id of channels) {
                    try {
                        const channel = await userSelfBot.channels.fetch(id);
                        if (channel) await channel.send(msg);
                    } catch (e) { console.error(e); }
                }
            };
            await sendAds();
            activeTasks.set(userId, { client: userSelfBot, interval: setInterval(sendAds, delay) });
            await interaction.editReply({ content: `✅ **Running!**`, components: [createButtons(userId, true)] });
        });

        try { 
            await userSelfBot.login(token); 
        } catch (e) { 
            await interaction.editReply({ content: '❌ Invalid Token!', components: [createButtons(userId, false)] }); 
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
