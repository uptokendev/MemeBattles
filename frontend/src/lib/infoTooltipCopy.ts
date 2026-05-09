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
  title: {
    ariaLabel: "Explain promotion title",
    lines: ["The public name shown for this promotion."],
  },
  description: {
    ariaLabel: "Explain promotion description",
    lines: ["Short text explaining what this promotion is about and why people should care."],
  },
  image: {
    ariaLabel: "Explain promotion image",
    lines: ["The image used to make the promotion stand out across the platform."],
  },
  link: {
    ariaLabel: "Explain promotion link",
    lines: ["Where users go when they click the promotion."],
  },
  token: {
    ariaLabel: "Explain token selection",
    lines: ["Choose which token or campaign this promotion is connected to."],
  },
  startDate: {
    ariaLabel: "Explain start date",
    lines: ["When this promotion becomes active."],
  },
  endDate: {
    ariaLabel: "Explain end date",
    lines: ["When this promotion stops showing."],
  },
  budget: {
    ariaLabel: "Explain promotion budget",
    lines: ["The amount reserved for this promotion."],
  },
  status: {
    ariaLabel: "Explain promotion status",
    lines: ["Controls whether the promotion is active, paused, or inactive."],
  },
  saveChanges: {
    ariaLabel: "Explain save changes",
    lines: ["Saves your edits. Live promotions may update immediately after saving."],
  },
  deletePromotion: {
    ariaLabel: "Explain delete promotion",
    lines: ["Removes this promotion from public display. This cannot always be undone."],
  },
} as const;
