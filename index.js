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
    MessageFlags,
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    escapeMarkdown
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

const FORUM_CHANNEL_ID = "1535400287248851144";
const ANONYMOUS_AVATAR = path.join(__dirname, "anonymous.png");
const WEBHOOK_NAME = "Anonmata Anonymous";
const NORMAL_REPLY_COMMAND = "Reply Anonymously";

const DATA_FILE =
    process.env.RAILWAY_ENVIRONMENT
        ? "/data/anonymous-users.json"
        : path.join(__dirname, "anonymous-users.json");

let anonymousData = {};

function loadAnonymousData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            anonymousData = JSON.parse(
                fs.readFileSync(DATA_FILE, "utf8")
            );

            console.log(
                `Loaded anonymous identities from ${DATA_FILE}`
            );
        } else {
            anonymousData = {};
            console.log("No anonymous database yet.");
        }
    } catch (error) {
        console.error(
            "Could not load anonymous database:",
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
            "Could not save anonymous database:",
            error
        );
    }
}

function getAnonymousNumber(threadId, userId) {
    if (!anonymousData[threadId]) {
        anonymousData[threadId] = {
            users: {},
            nextNumber: 1
        };
    }

    const threadData = anonymousData[threadId];

    if (threadData.users[userId]) {
        return threadData.users[userId];
    }

    const number = threadData.nextNumber;

    threadData.users[userId] = number;
    threadData.nextNumber += 1;

    saveAnonymousData();

    return number;
}

function makeExcerpt(content) {
    if (!content) return "message";

    let cleanContent = content;

    // Anonymous replies have:
    // **Name — “quoted message”**
    // actual reply
    //
    // Remove that first line so nested replies only quote
    // the actual response.
    const lines = cleanContent.split("\n");

    if (
        lines.length > 1 &&
        lines[0].startsWith("**") &&
        lines[0].endsWith("**")
    ) {
        cleanContent = lines.slice(1).join("\n");
    }

    // Remove Discord markdown that could mess up the quote
    cleanContent = cleanContent
        .replace(/\*\*/g, "")
        .replace(/__/g, "")
        .replace(/~~/g, "")
        .replace(/`/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const maxLength = 70;

    if (cleanContent.length <= maxLength) {
        return cleanContent;
    }

    return cleanContent.slice(0, maxLength - 3) + "...";
}
loadAnonymousData();

async function ensureContextMenuCommand() {
    try {
        const forumChannel =
            await client.channels.fetch(FORUM_CHANNEL_ID);

        const guild = forumChannel.guild;

        const commands =
            await guild.commands.fetch();

        const existing =
            commands.find(
                command =>
                    command.name === NORMAL_REPLY_COMMAND &&
                    command.type === ApplicationCommandType.Message
            );

        if (existing) {
            console.log(
                `"${NORMAL_REPLY_COMMAND}" command already registered.`
            );
            return;
        }

        const command =
            new ContextMenuCommandBuilder()
                .setName(NORMAL_REPLY_COMMAND)
                .setType(ApplicationCommandType.Message);

        await guild.commands.create(command);

        console.log(
            `Registered "${NORMAL_REPLY_COMMAND}" context command.`
        );

    } catch (error) {
        console.error(
            "Could not register context command:"
        );

        console.error(error);
    }
}

client.once(
    Events.ClientReady,
    async (readyClient) => {
        console.log(
            `Anonmata is online as ${readyClient.user.tag}!`
        );

        console.log(
            `Anonymous database: ${DATA_FILE}`
        );

        await ensureContextMenuCommand();
    }
);

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

client.on(
    Events.InteractionCreate,
    async (interaction) => {

        // Right-click normal message -> Apps -> Reply Anonymously
        if (
            interaction.isMessageContextMenuCommand() &&
            interaction.commandName ===
                NORMAL_REPLY_COMMAND
        ) {
            const target =
                interaction.targetMessage;

            const thread =
                target.channel;

            if (
                !thread.isThread() ||
                thread.parentId !==
                    FORUM_CHANNEL_ID
            ) {
                await interaction.reply({
                    content:
                        "❌ Anonymous replies can only be used inside the psychology forum.",
                    flags:
                        MessageFlags.Ephemeral
                });

                return;
            }

            if (target.webhookId) {
                await interaction.reply({
                    content:
                        "ℹ️ Use the **Reply Anonymously** button underneath anonymous messages.",
                    flags:
                        MessageFlags.Ephemeral
                });

                return;
            }

            const modal =
                new ModalBuilder()
                    .setCustomId(
                        `normalreply_${thread.id}_${target.id}`
                    )
                    .setTitle(
                        "Reply Anonymously"
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

        // Main anonymous answer button
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

        // Reply Anonymously button under anonymous messages
        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                "anonreply_"
            )
        ) {
            const parts =
                interaction.customId.split("_");

            const threadId = parts[1];
            const targetNumber = parts[2];
            const targetMessageId = parts[3];

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

        // Normal anonymous answer submitted
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

            const content =
                interaction.fields
                    .getTextInputValue(
                        "answerText"
                    )
                    .trim();

            await postAnonymousMessage({
                interaction,
                threadId,
                content,
                replyLabel: null,
                replyExcerpt: null,
                targetMessageId: null
            });

            return;
        }

        // Anonymous -> anonymous reply
        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith(
                "replysubmit_"
            )
        ) {
            const parts =
                interaction.customId.split("_");

            const threadId = parts[1];
            const targetNumber = parts[2];
            const targetMessageId = parts[3];

            const content =
                interaction.fields
                    .getTextInputValue(
                        "replyText"
                    )
                    .trim();

            try {
                const thread =
                    await client.channels.fetch(
                        threadId
                    );

                const target =
                    await thread.messages.fetch(
                        targetMessageId
                    );

                const excerpt =
                    makeExcerpt(target.content);

                await postAnonymousMessage({
                    interaction,
                    threadId,
                    content,
                    replyLabel:
                        `Anonymous #${targetNumber}`,
                    replyExcerpt:
                        excerpt,
                    targetMessageId
                });

            } catch (error) {
                console.error(
                    "Could not find anonymous target message:",
                    error
                );

                await interaction.reply({
                    content:
                        "❌ I couldn't find the message you're replying to.",
                    flags:
                        MessageFlags.Ephemeral
                });
            }

            return;
        }

        // Anonymous -> normal user reply
        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith(
                "normalreply_"
            )
        ) {
            const parts =
                interaction.customId.split("_");

            const threadId = parts[1];
            const targetMessageId = parts[2];

            const content =
                interaction.fields
                    .getTextInputValue(
                        "replyText"
                    )
                    .trim();

            try {
                const thread =
                    await client.channels.fetch(
                        threadId
                    );

                if (
                    !thread ||
                    !thread.isThread() ||
                    thread.parentId !==
                        FORUM_CHANNEL_ID
                ) {
                    await interaction.reply({
                        content:
                            "❌ I couldn't find that Forum post.",
                        flags:
                            MessageFlags.Ephemeral
                    });

                    return;
                }

                const target =
                    await thread.messages.fetch(
                        targetMessageId
                    );

                const displayName =
                    target.member?.displayName ||
                    target.author.globalName ||
                    target.author.username ||
                    "Unknown User";

                const excerpt =
                    makeExcerpt(target.content);

                await postAnonymousMessage({
                    interaction,
                    threadId,
                    content,
                    replyLabel:
                        escapeMarkdown(
                            displayName
                        ),
                    replyExcerpt:
                        excerpt,
                    targetMessageId
                });

            } catch (error) {
                console.error(
                    "Could not find target message:",
                    error
                );

                await interaction.reply({
                    content:
                        "❌ I couldn't find the message you're replying to.",
                    flags:
                        MessageFlags.Ephemeral
                });
            }

            return;
        }
    }
);

async function postAnonymousMessage({
    interaction,
    threadId,
    content,
    replyLabel,
    replyExcerpt,
    targetMessageId
}) {
    try {
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

        const anonymousNumber =
            getAnonymousNumber(
                threadId,
                interaction.user.id
            );

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

        let messageContent =
            content;

        if (
            replyLabel &&
            replyExcerpt
        ) {
            messageContent =
                `**${replyLabel} — “${escapeMarkdown(replyExcerpt)}”**\n${content}`;
        }

        const postedMessage =
            await webhook.send({
                content:
                    messageContent,

                username:
                    `Anonymous #${anonymousNumber}`,

                threadId:
                    thread.id,

                wait:
                    true,

                allowedMentions: {
                    parse: []
                }
            });

        // No icon now — text only
        const replyButton =
            new ButtonBuilder()
                .setCustomId(
                    `anonreply_${thread.id}_${anonymousNumber}_${postedMessage.id}`
                )
                .setLabel(
                    "Reply Anonymously"
                )
                .setStyle(
                    ButtonStyle.Secondary
                );

        await webhook.editMessage(
            postedMessage.id,
            {
                threadId:
                    thread.id,

                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            replyButton
                        )
                ],

                allowedMentions: {
                    parse: []
                }
            }
        );

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

        if (replyLabel) {
            console.log(
                `Replying to: ${replyLabel}`
            );

            console.log(
                `Target Message ID: ${targetMessageId}`
            );
        }

        console.log(
            `Content: ${content}`
        );

        console.log(
            "======================================="
        );

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

client.login(
    process.env.DISCORD_TOKEN
);