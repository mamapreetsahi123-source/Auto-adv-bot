require('dotenv').config(); // Ensure you have a .env file with DISCORD_TOKEN
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const activeTasks = new Map();
const AUTHORIZED_ID = '1277163202614001706';

client.on('ready', () => console.log(`Bot logged as ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
    // Panel Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
        if (interaction.user.id !== AUTHORIZED_ID) return interaction.reply({ content: "Unauthorized.", ephemeral: true });
        
        const embed = new EmbedBuilder()
            .setTitle("🚀 Advertising Control Panel")
            .setDescription("Click the button below to configure and start your advertising.")
            .setColor(0x0099ff);
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('start_adv_btn').setLabel('Start Advertising').setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
    }

    // Modal Trigger
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

    // Adv Subcommands
    if (interaction.isChatInputCommand() && interaction.commandName === 'adv') {
        const sub = interaction.options.getSubcommand();
        const task = activeTasks.get(interaction.user.id);

        if (sub === 'status') {
            if (!task) return interaction.reply({ content: "No task is currently running.", ephemeral: true });
            return interaction.reply({ 
                content: `### 📊 Advertising Status\n**State:** ${task.running ? 'Running ✅' : 'Stopped 🛑'}\n**Messages Sent:** ${task.sent}\n**Failed Attempts:** ${task.failed}`, 
                ephemeral: true 
            });
        }

        if (sub === 'stop') {
            if (!task) return interaction.reply({ content: "No task is active to stop.", ephemeral: true });
            clearInterval(task.interval);
            task.client.destroy();
            activeTasks.delete(interaction.user.id);
            return interaction.reply({ content: "Advertising has been stopped.", ephemeral: true });
        }
    }

    // Modal Handling
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

        await userSelfBot.login(token).catch(err => {
            return interaction.reply({ content: "❌ Failed to login: Invalid Token", ephemeral: true });
        });
        
        interaction.reply({ content: "✅ Advertising task started successfully!", ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
