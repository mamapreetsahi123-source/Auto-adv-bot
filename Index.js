const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const express = require('express');

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
            .setLabel('Start Advertising')
            .setEmoji('🚀')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isProcessing),
        new ButtonBuilder()
            .setCustomId(`stop_btn_${userId}`)
            .setLabel('Stop Advertising')
            .setEmoji('🛑')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!isProcessing)
    );
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        // Prevent multiple panels for the same user
        if (activeTasks.has(interaction.user.id)) {
            return interaction.reply({ content: "⚠️ You already have an active advertising panel running!", ephemeral: true });
        }
        await interaction.reply({ 
            content: `### 🤖 **PRIVATE CONTROL PANEL**\nThis panel is locked to <@${interaction.user.id}>.\n*Status: Awaiting Setup*`, 
            components: [createButtons(interaction.user.id, false)] 
        });
    }

    if (interaction.isButton()) {
        const userId = interaction.customId.split('_').pop();
        
        // PROTECTION: Only the person who created the panel can click its buttons
        if (interaction.user.id !== userId) {
            return interaction.reply({ content: "❌ This is not your panel!", ephemeral: true });
        }

        if (interaction.customId.startsWith('stop_btn_')) {
            await interaction.deferUpdate();
            const task = activeTasks.get(userId);
            if (task) {
                clearInterval(task.interval);
                task.client.destroy();
                activeTasks.delete(userId);
                await interaction.editReply({ 
                    content: `### 🤖 **PRIVATE CONTROL PANEL**\nThis panel is locked to <@${userId}>.\n*Status: Stopped*`, 
                    components: [createButtons(userId, false)] 
                });
            }
        }

        if (interaction.customId.startsWith('start_btn_')) {
            // PROTECTION: Prevent starting if already active
            if (activeTasks.has(userId)) {
                return interaction.reply({ content: "⚠️ You already have a task running!", ephemeral: true });
            }
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

    if (interaction.isModalSubmit() && interaction.customId.startsWith('adv_modal_')) {
        const userId = interaction.customId.split('_').pop();
        await interaction.deferUpdate();

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
            await interaction.editReply({ 
                content: `### 🤖 **PRIVATE CONTROL PANEL**\nThis panel is locked to <@${userId}>.\n*Status: Running* ✅`, 
                components: [createButtons(userId, true)] 
            });
        });

        try { 
            await userSelfBot.login(token); 
        } catch (e) { 
            await interaction.editReply({ 
                content: `### 🤖 **PRIVATE CONTROL PANEL**\n*Status: Error - Invalid Token* ❌`, 
                components: [createButtons(userId, false)] 
            }); 
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
