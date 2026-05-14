const DEFAULT_MODEL = "gpt-4.1-mini";

const PLATFORM_GUIDE = {
  x: "Write one punchy X post. Max 280 characters. No thread numbering. Make it direct, competitive, and clear.",
  instagram: "Write one Instagram caption. Make it visual and community-focused. Include 5-8 relevant hashtags.",
  threads: "Write one Threads post. Conversational, slightly deeper, with line breaks. No more than 900 characters.",
  tiktok: "Write one TikTok script with Hook, Body, and CTA labels. Make it spoken and energetic.",
  article: "Write an article-style intro with a strong title and 2-4 short paragraphs. Make it suitable for a website/blog.",
  website: "Write website copy with a short headline, subheadline, and body. Clear and conversion-focused.",
};

const CAMPAIGN_GUIDE = {
  league_update: "Focus on weekly/monthly league competition, rankings, winners, creators, traders, and recurring event energy.",
  creator_spotlight: "Focus on highlighting a creator, their launch, their community, and why people should pay attention.",
  launch_announcement: "Focus on announcing a new launch, making the opportunity clear without overpromising returns.",
  upvote_education: "Explain UpVotes as paid transparent discovery that affects ranking/visibility. Keep it simple.",
  recruiter_content: "Focus on recruiter/community growth, referral ecosystems, and helping creators/traders join the arena.",
  squad_content: "Focus on squads, community competition, member contribution, and shared upside.",
  airdrop_update: "Focus on Warzone BNB Airdrops, eligibility, participation, and active community rewards.",
  brand_post: "Focus on the bigger MemeWarzone thesis: launches as an arena, recurring attention, creator-first mechanics.",
  article: "Focus on long-form clarity, educational framing, and structured explanation.",
};

function sendError(res, status, error, details) {
  return res.status(status).json({ ok: false, error, details });
}

function cleanString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanPlatforms(value) {
  const requested = Array.isArray(value) ? value : ["x", "instagram", "threads", "tiktok", "article", "website"];
  return requested.filter((platform) => Object.hasOwn(PLATFORM_GUIDE, platform));
}

function getOpenAiErrorMessage(payload, fallback) {
  return cleanString(
    payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      fallback,
    fallback
  );
}

function getOpenAiErrorCode(payload) {
  return cleanString(payload?.error?.code || payload?.code || payload?.error?.type || payload?.type);
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {}

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function buildPrompt({ baseText, campaignType, tone, platforms, extraContext }) {
  const selectedPlatformGuide = platforms
    .map((platform) => `- ${platform}: ${PLATFORM_GUIDE[platform]}`)
    .join("\n");

  return `You are the MemeWarzone content strategist.

Brand context:
MemeWarzone / MemeBattles is a creator-first meme launchpad on BNB Chain. It turns meme launches into an arena using UpVotes, Leagues, creator-first launches, community competition, and recurring content moments.

Campaign type:
${campaignType || "brand_post"}
${CAMPAIGN_GUIDE[campaignType] || CAMPAIGN_GUIDE.brand_post}

Tone:
${tone || "Bold, competitive, crypto-native, clear, creator-first, no unrealistic promises."}

Extra context:
${extraContext || "None."}

Base idea:
${baseText}

Generate platform-specific variants for these platforms:
${selectedPlatformGuide}

Rules:
- Do not mention guaranteed profit, investment advice, or unrealistic returns.
- Keep the copy hype but credible.
- Avoid generic marketing fluff.
- Use line breaks where useful.
- Return valid JSON only.
- JSON keys must exactly match the requested platform keys.
- Each value must be a string.

Return this exact shape:
{
${platforms.map((platform) => `  "${platform}": "..."`).join(",\n")}
}`;
}

export async function contentAiGenerateVariants(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed");

  const apiKey = cleanString(process.env.OPENAI_API_KEY);
  if (!apiKey) return sendError(res, 500, "OPENAI_API_KEY is not configured on the API service");

  const baseText = cleanString(req.body?.baseText);
  if (!baseText) return sendError(res, 400, "baseText is required");

  const platforms = cleanPlatforms(req.body?.platforms);
  if (!platforms.length) return sendError(res, 400, "At least one valid platform is required");

  const campaignType = cleanString(req.body?.campaignType, "brand_post");
  const tone = cleanString(req.body?.tone, "Bold, competitive, crypto-native, clear, creator-first.");
  const extraContext = cleanString(req.body?.extraContext);
  const model = cleanString(process.env.OPENAI_MODEL, DEFAULT_MODEL);

  const prompt = buildPrompt({ baseText, campaignType, tone, platforms, extraContext });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "You generate production-ready social and website content variants as strict JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_output_tokens: 2200,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const openAiMessage = getOpenAiErrorMessage(payload, "OpenAI request failed");
    const openAiCode = getOpenAiErrorCode(payload);
    const friendlyMessage = response.status === 429
      ? `OpenAI 429: ${openAiMessage}. Check API billing, credits, rate limits, model access, or project usage limits.`
      : `OpenAI ${response.status}: ${openAiMessage}`;

    console.error("[content-ai] OpenAI request failed", {
      status: response.status,
      model,
      code: openAiCode,
      message: openAiMessage,
    });

    return sendError(res, response.status, friendlyMessage, {
      provider: "openai",
      status: response.status,
      model,
      code: openAiCode,
      message: openAiMessage,
    });
  }

  const outputText =
    payload?.output_text ||
    payload?.output?.flatMap((item) => item?.content || [])?.map((part) => part?.text || "").join("\n") ||
    "";

  const parsed = parseJsonObject(outputText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return sendError(res, 502, "AI response was not valid JSON", { outputText });
  }

  const variants = {};
  for (const platform of platforms) {
    variants[platform] = cleanString(parsed[platform]);
  }

  return res.json({
    ok: true,
    model,
    campaignType,
    tone,
    variants,
  });
}
