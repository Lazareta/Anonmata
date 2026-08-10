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

const fs = require("fs");
const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ======================================================
// CONFIG
// ======================================================

const FORUM_CHANNEL_ID = "1535400287248851144";

const ANONYMOUS_AVATAR =
    path.join(__dirname, "anonymous.png");

const WEBHOOK_NAME = "Anonmata Anonymous";

// Railway persistent volume.
// When testing locally, use a local file instead.
const DATA_FILE = process.env.RAILWAY_ENVIRONMENT
    ? "/data/anonymous-users.json"
    : path.join(__dirname, "anonymous-users.json");

// ======================================================
// PERSISTENT ANONYMOUS IDENTITIES
// ======================================================

let anonymousData = {};

function loadAnonymousData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, "utf8");

            anonymousData = JSON.parse(raw);

            console.log(
                `Loaded anonymous identity data from ${DATA_FILE}`
            );
        } else {
            anonymousData = {};

            console.log(
                "No anonymous identity database yet. Starting fresh."
            );
        }
    } catch (error) {
        console.error(
            "Could not load anonymous identity database:",
            error
        );

        anonymousData = {};
    }
}

function saveAnonymousData() {
    try {
        const directory = path.dirname(DATA_FILE);

        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, {
                recursive: true
            });
        }

        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(anonymousData, null, 2),
            "utf8"
        );

    } catch (error) {
        console.error(
            "Could not save anonymous identity database:",
            error
        );
    }
}

function getAnonymousNumber(threadId, userId) {

    // Create storage for this forum thread
    if (!anonymousData[threadId]) {
        anonymousData[threadId] = {
            users: {},
            nextNumber: 1
        };
    }

    const threadData =
        anonymousData[threadId];

    // Existing anonymous identity
    if (threadData.users[userId]) {
        return threadData.users[userId];
    }

    // New anonymous identity
    const number =
        threadData.nextNumber;

    threadData.users[userId] =
        number;

    threadData.nextNumber += 1;

    saveAnonymousData();

    return number;
}

// Load identities immediately
loadAnonymousData();

// ======================================================
// BOT READY
// ======================================================

client.once(
    Events.ClientReady,
    (readyClient) => {

        console.log(
            `Anonmata is online as ${readyClient.user.tag}!`
        );

        console.log(
            `Anonymous database: ${DATA_FILE}`
        );
    }
);

// ======================================================
// NEW FORUM THREAD
// ======================================================

client.on(
    Events.ThreadCreate,
    async (thread) => {

        try {

            if (
                thread.parentId !==
                FORUM_CHANNEL_ID
            ) {
                return;
            }

            const anonymousButton =
                new ButtonBuilder()
                    .setCustomId(
                        `anonymous_${thread.id}`
                    )
                    .setLabel(
                        "Answer Anonymously"
                    )
                    .setEmoji("🕵️")
                    .setStyle(
                        ButtonStyle.Secondary
                    );

            const row =
                new ActionRowBuilder()
                    .addComponents(
                        anonymousButton
                    );

            await thread.send({
                content:
                    "Prefer to answer anonymously?",
                components: [row]
            });

            console.log(
                `Added anonymous button to: ${thread.name}`
            );

        } catch (error) {

            console.error(
                "Error adding anonymous button:",
                error
            );
        }
    }
);

// ======================================================
// INTERACTIONS
// ======================================================

client.on(
    Events.InteractionCreate,
    async (interaction) => {

        // ==============================================
        // MAIN ANONYMOUS BUTTON
        // ==============================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                "anonymous_"
            )
        ) {

            const threadId =
                interaction.customId.replace(
                    "anonymous_",
                    ""
                );

            const modal =
                new ModalBuilder()
                    .setCustomId(
                        `answer_${threadId}`
                    )
                    .setTitle(
                        "Anonymous Answer"
                    );

            const answerInput =
                new TextInputBuilder()
                    .setCustomId(
                        "answerText"
                    )
                    .setLabel(
                        "Your answer"
                    )
                    .setStyle(
                        TextInputStyle.Paragraph
                    )
                    .setPlaceholder(
                        "Write your answer here..."
                    )
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(1900);

            modal.addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        answerInput
                    )
            );

            await interaction.showModal(
                modal
            );

            return;
        }

        // ==============================================
        // REPLY ANONYMOUSLY BUTTON
        // ==============================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                "anonreply_"
            )
        ) {

            const parts =
                interaction.customId.split("_");

            const threadId =
                parts[1];

            const targetNumber =
                parts[2];

            const targetMessageId =
                parts[3];

            const modal =
                new ModalBuilder()
                    .setCustomId(
                        `replysubmit_${threadId}_${targetNumber}_${targetMessageId}`
                    )
                    .setTitle(
                        `Reply to Anonymous #${targetNumber}`
                    );

            const replyInput =
                new TextInputBuilder()
                    .setCustomId(
                        "replyText"
                    )
                    .setLabel(
                        "Your anonymous reply"
                    )
                    .setStyle(
                        TextInputStyle.Paragraph
                    )
                    .setPlaceholder(
                        "Write your reply..."
                    )
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(1800);

            modal.addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        replyInput
                    )
            );

            await interaction.showModal(
                modal
            );

            return;
        }

        // ==============================================
        // NORMAL ANONYMOUS ANSWER
        // ==============================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith(
                "answer_"
            )
        ) {

            const threadId =
                interaction.customId.replace(
                    "answer_",
                    ""
                );

            const answer =
                interaction.fields
                    .getTextInputValue(
                        "answerText"
                    )
                    .trim();

            await postAnonymousMessage({
                interaction,
                threadId,
                content: answer,
                replyingToNumber: null,
                replyingToMessageId: null
            });

            return;
        }

        // ==============================================
        // ANONYMOUS REPLY SUBMISSION
        // ==============================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith(
                "replysubmit_"
            )
        ) {

            const parts =
                interaction.customId.split("_");

            const threadId =
                parts[1];

            const targetNumber =
                parts[2];

            const targetMessageId =
                parts[3];

            const reply =
                interaction.fields
                    .getTextInputValue(
                        "replyText"
                    )
                    .trim();

            await postAnonymousMessage({
                interaction,
                threadId,
                content: reply,
                replyingToNumber:
                    targetNumber,
                replyingToMessageId:
                    targetMessageId
            });

            return;
        }
    }
);

// ======================================================
// POST ANONYMOUS MESSAGE
// ======================================================

async function postAnonymousMessage({
    interaction,
    threadId,
    content,
    replyingToNumber,
    replyingToMessageId
}) {

    try {

        // ==============================================
        // FIND THREAD
        // ==============================================

        const thread =
            await client.channels.fetch(
                threadId
            );

        if (
            !thread ||
            !thread.isThread()
        ) {

            await interaction.reply({
                content:
                    "❌ I couldn't find that question.",
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        if (
            thread.parentId !==
            FORUM_CHANNEL_ID
        ) {

            await interaction.reply({
                content:
                    "❌ This isn't a valid anonymous-answer post.",
                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        // ==============================================
        // GET PERSISTENT ANONYMOUS NUMBER
        // ==============================================

        const anonymousNumber =
            getAnonymousNumber(
                threadId,
                interaction.user.id
            );

        // ==============================================
        // FIND / CREATE WEBHOOK
        // ==============================================

        const forumChannel =
            await client.channels.fetch(
                FORUM_CHANNEL_ID
            );

        const webhooks =
            await forumChannel.fetchWebhooks();

        let webhook =
            webhooks.find(
                hook =>
                    hook.name ===
                        WEBHOOK_NAME &&
                    hook.owner?.id ===
                        client.user.id
            );

        if (!webhook) {

            webhook =
                await forumChannel.createWebhook({
                    name:
                        WEBHOOK_NAME,
                    avatar:
                        ANONYMOUS_AVATAR
                });

            console.log(
                "Created anonymous webhook."
            );
        }

        // ==============================================
        // BUILD MESSAGE
        // ==============================================

        let messageContent =
            content;

        if (replyingToNumber) {

            messageContent =
                `↩️ **Replying to Anonymous #${replyingToNumber}**\n${content}`;
        }

        /*
         * We first send the message.
         *
         * Then we edit it to attach a reply button
         * containing THIS message's ID.
         */

        const postedMessage =
            await webhook.send({
                content:
                    messageContent,

                username:
                    `Anonymous #${anonymousNumber}`,

                avatarURL:
                    undefined,

                threadId:
                    thread.id,

                wait:
                    true,

                allowedMentions: {
                    parse: []
                }
            });

        // ==============================================
        // ADD REPLY BUTTON
        // ==============================================

        const replyButton =
            new ButtonBuilder()
                .setCustomId(
                    `anonreply_${thread.id}_${anonymousNumber}_${postedMessage.id}`
                )
                .setLabel(
                    "Reply Anonymously"
                )
                .setEmoji("↩️")
                .setStyle(
                    ButtonStyle.Secondary
                );

        const replyRow =
            new ActionRowBuilder()
                .addComponents(
                    replyButton
                );

        await webhook.editMessage(
            postedMessage.id,
            {
                threadId:
                    thread.id,

                components:
                    [replyRow]
            }
        );

        // ==============================================
        // PRIVATE MODERATION LOG
        // ==============================================

        console.log(
            "========== ANONYMOUS MESSAGE =========="
        );

        console.log(
            `Question: ${thread.name}`
        );

        console.log(
            `Thread ID: ${thread.id}`
        );

        console.log(
            `Anonymous #: ${anonymousNumber}`
        );

        console.log(
            `Discord User ID: ${interaction.user.id}`
        );

        console.log(
            `Webhook Message ID: ${postedMessage.id}`
        );

        if (replyingToNumber) {

            console.log(
                `Replying to Anonymous #${replyingToNumber}`
            );

            console.log(
                `Target Message ID: ${replyingToMessageId}`
            );
        }

        console.log(
            `Content: ${content}`
        );

        console.log(
            "======================================="
        );

        // ==============================================
        // PRIVATE CONFIRMATION
        // ==============================================

        await interaction.reply({
            content:
                `✅ Posted as Anonymous #${anonymousNumber}!`,

            flags:
                MessageFlags.Ephemeral
        });

    } catch (error) {

        console.error(
            "Error posting anonymous message:"
        );

        console.error(error);

        try {

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({
                    content:
                        "❌ Something went wrong while posting your answer.",

                    flags:
                        MessageFlags.Ephemeral
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

// ======================================================
// LOGIN
// ======================================================

client.login(
    process.env.DISCORD_TOKEN
);