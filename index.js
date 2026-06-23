// --- COMPATIBILITY PATCH ---
if (typeof File === 'undefined') {
    global.File = class File extends Blob {
        constructor(parts, name, options) {
            super(parts, options);
            this.name = name;
        }
    };
}
// ---------------------------

require('dotenv').config();
const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, REST, Routes 
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const activeTasks = new Map();
const AUTHORIZED_ID = '1277163202614001706';

client.once('ready', async () => {
    console.log(`Bot logged as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const commands = [{
        name: 'adv',
        description: 'Advertising management',
        options: [
            { name: 'status', description: 'Check status', type: 1 },
            { name: 'stop', description: 'Stop advertising', type: 1 }
        ]
    }];
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on('messageCreate', async (message) => {
    if (message.content === '!panel' && message.author.id === AUTHORIZED_ID) {
        const embed = new EmbedBuilder()
            .setTitle("🚀 Advertising Control Panel")
            .setDescription("Welcome to the advanced automated advertising suite. Manage your campaigns below.")
            .setColor(0x5865F2)
            .addFields(
                { name: "📋 Setup", value: "Click the **Start Advertising** button to configure your campaign.", inline: false },
                { name: "⚙️ Commands", value: "• `/adv status` — View active stats.\n• `/adv stop` — Terminate all tasks.", inline: false }
            )
            .setFooter({ text: "Auto-Adv System | Secured" })
            .setTimestamp();
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('start_adv_btn').setLabel('Start Advertising').setStyle(ButtonStyle.Primary)
        );
        return message.channel.send({ embeds: [embed], components: [row] });
    }
});

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

    if (interaction.isChatInputCommand() && interaction.commandName === 'adv') {
        const sub = interaction.options.getSubcommand();
        const task = activeTasks.get(interaction.user.id);
        if (sub === 'status') {
            if (!task) return interaction.reply({ content: "❌ No active task.", ephemeral: true });
            return interaction.reply({ 
                embeds: [new EmbedBuilder().setTitle("📊 Status").addFields(
                    { name: "State", value: task.running ? "Running ✅" : "Stopped 🛑", inline: true },
                    { name: "Sent", value: task.sent.toString(), inline: true },
                    { name: "Failed", value: task.failed.toString(), inline: true }
                ).setColor(task.running ? 0x00FF00 : 0xFF0000)], ephemeral: true 
            });
        }
        if (sub === 'stop') {
            if (!task) return interaction.reply({ content: "❌ No task active.", ephemeral: true });
            clearInterval(task.interval);
            task.client.destroy();
            activeTasks.delete(interaction.user.id);
            return interaction.reply({ content: "✅ Advertising terminated.", ephemeral: true });
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'adv_modal') {
        await interaction.reply({ content: "🚀 Processing your request...", ephemeral: true });
        
        const token = interaction.fields.getTextInputValue('token');
        const msg = interaction.fields.getTextInputValue('msg');
        const delay = parseInt(interaction.fields.getTextInputValue('delay')) * 1000;
        const channels = interaction.fields.getTextInputValue('channels').split(',').map(id => id.trim());

        const userSelfBot = new SelfClient({ checkUpdate: false });
        let finished = false;

        const timeout = setTimeout(() => {
            if (!finished) {
                userSelfBot.destroy();
                interaction.editReply({ content: "❌ Connection timeout. Host network likely blocking Discord." }).catch(() => {});
            }
        }, 15000);

        userSelfBot.once('ready', async () => {
            finished = true;
            clearTimeout(timeout);
            const taskObj = { client: userSelfBot, running: true, sent: 0, failed: 0 };
            const sendAds = async () => {
                for (const id of channels) {
                    try {
                        const channel = await userSelfBot.channels.fetch(id);
                        if (channel) {
                            await channel.send(msg);
                            taskObj.sent++;
                        }
                    } catch { taskObj.failed++; }
                }
            };
            try {
                await sendAds();
                taskObj.interval = setInterval(sendAds, delay);
                activeTasks.set(interaction.user.id, taskObj);
                await interaction.editReply({ content: "✅ Your advertisement is started." });
            } catch {
                userSelfBot.destroy();
                await interaction.editReply({ content: "❌ Error: Check permissions or channel IDs." });
            }
        });

        userSelfBot.login(token).catch(async () => {
            finished = true;
            clearTimeout(timeout);
            await interaction.editReply({ content: "❌ Invalid Token or Account Locked." });
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
