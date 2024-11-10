import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActivityType,
} from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

let eventActive = false;
let eventStartTime;
let totalRemaining = 0;
let guild;

const commands = [
  new SlashCommandBuilder()
    .setName("event")
    .setDescription("📍 - Startet oder stoppt ein Event")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("start oder stop")
        .setRequired(true)
        .addChoices(
          { name: "Starten", value: "start" },
          { name: "Stoppen", value: "stop" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("🔨 - Bannt einen Benutzer")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Der Benutzer, der gebannt werden soll")
        .setRequired(true)
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("⚙️ - Starte das Registrieren der Slash-Befehle...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("✅ - Slash-Befehle wurden erfolgreich registriert.");
  } catch (error) {
    console.error("❌ - Fehler beim Registrieren der Slash-Befehle:", error);
  }
})();

client.once("ready", async () => {
  console.log(`Eingeloggt als ${client.user.tag}`);
  guild = client.guilds.cache.get(process.env.GUILD_ID);

  setInterval(async () => {
    try {
      const members = await guild.members.fetch();
      totalRemaining = members.filter(
        (m) =>
          !m.user.bot &&
          !m.roles.cache.has("987277750555516931") &&
          m.id !== client.user.id
      ).size;
      const bannedMembers = await guild.bans.fetch();
      await client.user.setPresence({
        activities: [
          {
            name: `👥 - ${totalRemaining} | 🔨 - ${bannedMembers.size}`,
            type: ActivityType.Watching,
          },
        ],
        status: "online",
      });
    } catch (error) {
      console.error("Fehler beim Abrufen der Mitglieder:", error);
    }
  }, 10000);
});
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === "event") {
    const action = interaction.options.getString("action");

    if (action === "start") {
      eventActive = true;
      eventStartTime = Date.now();
      const invites = await interaction.guild.invites.fetch();
      invites.forEach((invite) => invite.delete().catch(console.error));

      await interaction.reply(
        "> `✅` - **Das Event wurde gestartet**. Der `/ban`-Command ist nun aktiviert. __Viel Glück ❤️__\n"
      );
    }

    if (action === "stop") {
      eventActive = false;

      const bannedMembers = await interaction.guild.bans.fetch();
      bannedMembers.forEach(async (ban) => {
        await interaction.guild.members.unban(ban.user.id).catch(console.error);
      });

      await interaction.reply(
        "> `✅` - **Das Event wurde gestoppt**. Der `/ban`-Command ist nun deaktiviert."
      );
    }
  }

  if (commandName === "ban") {
    if (!eventActive) {
      await interaction.reply({
        content: "> `❌` - **Das Event ist derzeit nicht aktiv.**",
        ephemeral: true,
      });
      return;
    }

    const user = interaction.options.getUser("user");

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);
    if (
      user.id === interaction.user.id ||
      user.id === client.user.id ||
      (member && member.roles.cache.has("987277750555516931"))
    ) {
      await interaction.reply({
        content: "> `❌` **Du kannst diesen Benutzer nicht bannen.**",
        ephemeral: true,
      });
      return;
    }

    try {
      await user.send(
        `> \`💔\` - **Schade**, Du wurdest leider von **${interaction.user}**(\`${interaction.user.tag}\`) gebannt.\nWir wünschen dir beim nächsten Mal viel Glück. ❤️`
      );
    } catch (error) {
      console.error(`Fehler beim Senden der DM an ${user.tag}: ${error}`);
    }

    await interaction.guild.members
      .ban(user.id)
      .then(async () => {
        const remainingMembers = interaction.guild.members.cache.filter(
          (m) =>
            !m.user.bot &&
            m.id !== client.user.id &&
            !m.roles.cache.has("987277750555516931")
        );

        const totalRemaining = remainingMembers.size;

        interaction.reply({
          content: `> \`✅\` - ${user}(\`${
            user.tag
          }\`) wurde gebannt. (Verbleibend: **${totalRemaining - 1}**)`,
          ephemeral: true,
        });

        if (totalRemaining % 10 === 0) {
          const countdownMessage = `# > \`⏳\` - Es verbleiben noch **${totalRemaining}** Spieler.`;
          await interaction.channel.send(countdownMessage);
        }

        if (remainingMembers.size === 2) {
          const player1 = remainingMembers.first();
          const player2 = remainingMembers.last();
          const duelMessage = `# > \`⚔️\` - **Alles oder nichts, Wer gewinnt?** ${player1.user} oder ${player2.user}?`;
          interaction.channel.send(duelMessage);
        }

        if (remainingMembers.size === 1) {
          eventActive = false;
          const remainingMember = remainingMembers.first();

          const eventDuration = Date.now() - eventStartTime;
          const minutes = Math.floor(eventDuration / 60000);
          const seconds = Math.floor((eventDuration % 60000) / 1000);
          const formattedDuration = `> **${minutes} Minuten und ${seconds} Sekunden**`;

          const bannedMembers = await interaction.guild.bans.fetch();

          const eventSummaryEmbed = new EmbedBuilder()
            .setColor("#ffcc00")
            .setTitle("`🏆` - Event Zusammenfassung")
            .setDescription(
              `# \`🏆\` - Event Zusammenfassung\n\n\`🔢\` - Teilnehmer\n> ${
                bannedMembers.size + 1
              }\n\`⌛\` - Dauer\n> ${formattedDuration}`
            )
            .setFooter({ text: "Made by Vensin" })
            .setTimestamp();

          interaction.channel.send({
            content: `# > \`🏆\` - **Herzlichen Glückwunsch** __${remainingMember.user}__, **Du hast das Ban-Royal Event gewonnen!** 🎉`,
            embeds: [eventSummaryEmbed],
          });

          bannedMembers.forEach(async (ban) => {
            await interaction.guild.members
              .unban(ban.user.id)
              .catch(console.error);
          });
        }
      })
      .catch((error) => {
        console.error(error);
        interaction.reply("> `❌` - Fehler beim Bannen des Benutzers.");
      });
  }
});
client.login(process.env.TOKEN);
