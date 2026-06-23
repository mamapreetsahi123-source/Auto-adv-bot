require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');

// Added MessageContent intent to listen for "!panel"
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent 
    ] 
});

const activeTasks = new Map();
const AUTHORIZED_ID = '1277163202614001706';

client.on('ready', () => console.log(`Bot logged as ${client.user.tag}`));

// 1. Listen for !panel command
client.on('messageCreate', async (message) => {
    if (message.content === '!panel' && message.author.id === AUTHORIZED_ID) {
        const embed = new EmbedBuilder()
            .setTitle("🚀 Advertising Control Panel")
            .setDescription("Click the button below to start advertising.")
            .setColor(0x0099ff);
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('start_adv_btn').setLabel('Start Advertising').setStyle(ButtonStyle.Primary)
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }
});

// 2. Button and Modal Handling (Interaction-based)
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'start_adv_btn') {
        const modal = new ModalBuilder().setCustomId('adv_modal').setTitle('Advertising Setup');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('token').setLabel('User Token').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delay').setLabel('Delay (seconds)').setValue('60').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channels').setLabel('Channel IDs (comma separated)').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        return interaction.showModal(modal);
    }

    // 3. /adv Subcommands (Status/Stop)
    // NOTE: Keep these as slash commands if you prefer, or change to message commands
    if (interaction.isChatInputCommand() && interaction.commandName === 'adv') {
        const sub = interaction.options.getSubcommand();
        const task = activeTasks.get(interaction.user.id);

        if (sub === 'status') {
            if (!task) return interaction.reply({ content: "No task is running.", ephemeral: true });
            return interaction.reply({ 
                content: `### 📊 Advertising Status\n**State:** ${task.running ? 'Running ✅' : 'Stopped 🛑'}\n**Messages Sent:** ${task.sent}\n**Failed Attempts:** ${task.failed}`, 
                ephemeral: true 
            });
        }

        if (sub === 'stop') {
            if (!task) return interaction.reply({ content: "No task to stop.", ephemeral: true });
            clearInterval(task.interval);
            task.client.destroy();
            activeTasks.delete(interaction.user.id);
            return interaction.reply({ content: "Advertising has been stopped.", ephemeral: true });
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'adv_modal') {
        const token = interaction.fields.getTextInputValue('token');
        const msg = interaction.fields.getTextInputValue('msg');
        const delay = parseInt(interaction.fields.getTextInputValue('delay')) * 1000;
        const channels = interaction.fields.getTextInputValue('channels').split(',').map(id => id.trim());

        const userSelfBot = new SelfClient({ checkUpdate: false });
        
        userSelfBot.once('ready', async () => {
            const taskObj = { client: userSelfBot, running: true, sent: 0, failed: 0 };
            const taskLoop = setInterval(async () => {
                for (const id of channels) {
                    try {
                        const channel = await userSelfBot.channels.fetch(id);
                        await channel.send(msg);
                        taskObj.sent++;
                    } catch { taskObj.failed++; }
                }
            }, delay);
            taskObj.interval = taskLoop;
            activeTasks.set(interaction.user.id, taskObj);
        });

        await userSelfBot.login(token).catch(() => {});
        interaction.reply({ content: "✅ Advertising task started!", ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
