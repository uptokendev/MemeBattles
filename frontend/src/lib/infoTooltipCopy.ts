export const createPageTooltipCopy = {
  tokenCategory: {
    ariaLabel: "Explain token categories",
    lines: [
      "Meme = quick community coin launch.",
      "Project = utility/project launch, coming soon.",
    ],
  },
  createDraft: {
    ariaLabel: "Explain create drafts",
    lines: [
      "Save your coin setup without launching yet.",
      "Finish and launch it later.",
    ],
  },
} as const;

export const promotionTooltipCopy = {
  armNotification: {
    ariaLabel: "Explain arm notifications",
    lines: ["Get notifications for this promotion and token."],
  },
  promotionCard: {
    ariaLabel: "Explain promotion cards",
    lines: [
      "Promote this token with a card showing followers, arm notifications, and heat.",
    ],
  },
} as const;

export const promotionEditTooltipCopy = {
  identity: {
    ariaLabel: "Explain identity section",
    lines: ["The basic token details shown on the public promotion page."],
  },
  mission: {
    ariaLabel: "Explain mission statement",
    lines: ["Short text explaining what this promotion is about and why people should care."],
  },
  launchStrategy: {
    ariaLabel: "Explain launch strategy",
    lines: ["Explain how the token will build hype, activate the community, and move toward launch."],
  },
  comms: {
    ariaLabel: "Explain comms channels",
    lines: ["Public social and community links shown on the promotion page."],
  },
  docs: {
    ariaLabel: "Explain docs and creator note",
    lines: ["Optional supporting links and a creator note for people researching the token."],
  },
  visibility: {
    ariaLabel: "Explain visibility",
    lines: ["Choose whether the promotion is public, unlisted, or private."],
  },
  readiness: {
    ariaLabel: "Explain readiness",
    lines: ["Shows how complete the promotion setup is before publishing."],
  },
  saveChanges: {
    ariaLabel: "Explain save changes",
    lines: ["Saves your edits. Live promotions may update immediately after saving."],
  },
  archiveDraft: {
    ariaLabel: "Explain archive draft",
    lines: ["Removes this draft from public Prepare Mode listings."],
  },
} as const;
