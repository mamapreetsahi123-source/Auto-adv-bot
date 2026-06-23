require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, REST, Routes } = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const activeTasks = new Map();
const AUTHORIZED_ID = '1277163202614001706';

client.once('ready', async () => {
    console.log(`Bot logged as ${client.user.tag}`);
    
    // WIPE OLD COMMANDS: Run this once then you can remove this block
    // await client.application.commands.set([]); 
    
    // REGISTER ONLY THE /adv COMMAND
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const commands = [{
        name: 'adv',
        description: 'Advertising management',
        options: [
            { name: 'status', description: 'Check advertising status', type: 1 },
            { name: 'stop', description: 'Stop all advertising', type: 1 }
        ]
    }];
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

// !panel Command
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

// Interactions (Buttons, Modals, Slash Commands)
client.on('interactionCreate', async (interaction) => {
    // Button: Open Modal
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

    // Slash Commands: /adv status or /adv stop
    if (interaction.isChatInputCommand() && interaction.commandName === 'adv') {
        const sub = interaction.options.getSubcommand();
        const task = activeTasks.get(interaction.user.id);

        if (sub === 'status') {
            if (!task) return interaction.reply({ content: "No task is running.", ephemeral: true });
            return interaction.reply({ content: `### 📊 Status\n**State:** ${task.running ? 'Running ✅' : 'Stopped 🛑'}\n**Sent:** ${task.sent}\n**Failed:** ${task.failed}`, ephemeral: true });
        }

        if (sub === 'stop') {
            if (!task) return interaction.reply({ content: "No task to stop.", ephemeral: true });
            clearInterval(task.interval);
            task.client.destroy();
            activeTasks.delete(interaction.user.id);
            return interaction.reply({ content: "Advertising stopped.", ephemeral: true });
        }
    }

    // Modal Submit
    if (interaction.isModalSubmit() && interaction.customId === 'adv_modal') {
        const token = interaction.fields.getTextInputValue('token');
        const msg = interaction.fields.getTextInputValue('msg');
        const delay = parseInt(interaction.fields.getTextInputValue('delay')) * 1000;
        const channels = interaction.fields.getTextInputValue('channels').split(',').map(id => id.trim());

        const userSelfBot = new SelfClient({ checkUpdate: false });
        
        userSelfBot.once('ready', async () => {
            const taskObj = { client: userSelfBot, running: true, sent: 0, failed: 0 };
            taskObj.interval = setInterval(async () => {
                for (const id of channels) {
                    try {
                        const channel = await userSelfBot.channels.fetch(id);
                        await channel.send(msg);
                        taskObj.sent++;
                    } catch { taskObj.failed++; }
                }
            }, delay);
            activeTasks.set(interaction.user.id, taskObj);
        });

        await userSelfBot.login(token).catch(() => {});
        interaction.reply({ content: "✅ Task started!", ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
