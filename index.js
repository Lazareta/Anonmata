require("dotenv").config();

const {
    Client,
    Events,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require("discord.js");

const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

const FORUM_CHANNEL_ID = "1535400287248851144";
const ANONYMOUS_AVATAR = path.join(__dirname, "anonymous.png");
const WEBHOOK_NAME = "Anonmata Anonymous";

// Per-thread anonymous numbering.
// The same user keeps the same number inside the same question.
const anonymousUsers = new Map();

client.once(Events.ClientReady, (readyClient) => {
    console.log(`Anonmata is online as ${readyClient.user.tag}!`);
});

// Add anonymous-answer button to each new Forum post
client.on(Events.ThreadCreate, async (thread) => {
    try {
        if (thread.parentId !== FORUM_CHANNEL_ID) return;

        const anonymousButton = new ButtonBuilder()
            .setCustomId(`anonymous_${thread.id}`)
            .setLabel("Answer Anonymously")
            .setEmoji("🕵️")
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder()
            .addComponents(anonymousButton);

        await thread.send({
            content: "Prefer to answer anonymously?",
            components: [row]
        });

        console.log(`Added anonymous button to: ${thread.name}`);

    } catch (error) {
        console.error("Error adding anonymous button:");
        console.error(error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {

    // Anonymous button clicked
    if (interaction.isButton()) {
        if (!interaction.customId.startsWith("anonymous_")) return;

        const threadId =
            interaction.customId.replace("anonymous_", "");

        const modal = new ModalBuilder()
            .setCustomId(`answer_${threadId}`)
            .setTitle("Anonymous Answer");

        const answerInput = new TextInputBuilder()
            .setCustomId("answerText")
            .setLabel("Your answer")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Write your answer here...")
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2000);

        const row = new ActionRowBuilder()
            .addComponents(answerInput);

        modal.addComponents(row);

        await interaction.showModal(modal);
        return;
    }

    // Anonymous answer submitted
    if (interaction.isModalSubmit()) {
        if (!interaction.customId.startsWith("answer_")) return;

        const threadId =
            interaction.customId.replace("answer_", "");

        const answer =
            interaction.fields
                .getTextInputValue("answerText")
                .trim();

        try {
            const thread =
                await client.channels.fetch(threadId);

            if (!thread || !thread.isThread()) {
                await interaction.reply({
                    content: "❌ I couldn't find that question.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (thread.parentId !== FORUM_CHANNEL_ID) {
                await interaction.reply({
                    content: "❌ This isn't a valid anonymous-answer post.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Create the numbering map for this question if needed
            if (!anonymousUsers.has(threadId)) {
                anonymousUsers.set(threadId, new Map());
            }

            const threadUsers =
                anonymousUsers.get(threadId);

            let anonymousNumber =
                threadUsers.get(interaction.user.id);

            // First anonymous answer from this user in this question
            if (!anonymousNumber) {
                anonymousNumber = threadUsers.size + 1;

                threadUsers.set(
                    interaction.user.id,
                    anonymousNumber
                );

                console.log(
                    `[IDENTITY] ${thread.name} | Anonymous #${anonymousNumber} = Discord ID ${interaction.user.id}`
                );
            }

            const forumChannel =
                await client.channels.fetch(FORUM_CHANNEL_ID);

            const webhooks =
                await forumChannel.fetchWebhooks();

            let webhook =
                webhooks.find(
                    hook =>
                        hook.name === WEBHOOK_NAME &&
                        hook.owner?.id === client.user.id
                );

            if (!webhook) {
                webhook =
                    await forumChannel.createWebhook({
                        name: WEBHOOK_NAME,
                        avatar: ANONYMOUS_AVATAR
                    });

                console.log("Created anonymous webhook.");
            }

            const postedMessage = await webhook.send({
                content: answer,
                username: `Anonymous #${anonymousNumber}`,
                threadId: thread.id,
                wait: true,
                allowedMentions: {
                    parse: []
                }
            });

            // Private moderation log in Railway
            console.log("========== ANONYMOUS ANSWER ==========");
            console.log(`Question: ${thread.name}`);
            console.log(`Thread ID: ${thread.id}`);
            console.log(`Anonymous #: ${anonymousNumber}`);
            console.log(`Discord User ID: ${interaction.user.id}`);
            console.log(`Webhook Message ID: ${postedMessage.id}`);
            console.log(`Answer: ${answer}`);
            console.log("======================================");

            await interaction.reply({
                content:
                    `✅ Posted as Anonymous #${anonymousNumber}!`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error("Error posting anonymous answer:");
            console.error(error);

            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content:
                            "❌ Something went wrong while posting your answer.",
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (replyError) {
                console.error(
                    "Could not send error response:",
                    replyError
                );
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);