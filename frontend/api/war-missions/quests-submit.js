import crypto from "node:crypto";
import { pool } from "../../server/db.js";
import { readWarAuth, unauthorized } from "./_lib/auth.js";
import { ensureCurrentQuestInstance } from "./_lib/periods.js";
import { awardQuestForUser, buildWarProfile, getUserById, maybeVerifyReferralForUser } from "./_lib/profile.js";

const MANUAL_REVIEW_TYPES = new Set([
  "manual_review",
  "x_bio_link",
  "x_follow",
  "telegram_join",
  "discord_join",
  "telegram_discord_activity",
  "recruiter_application_accepted",
]);

const URL_SUBMISSION_TYPES = new Set([
  "x_unique_post_likes",
  "x_reply_quality",
  "x_quote_impressions",
  "x_post_impressions",
  "x_bio_link",
]);

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function normalizeSocialHandle(value) {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
}

function parseXPostUrl(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i);
  if (!match) return null;
  return {
    username: normalizeSocialHandle(match[1]),
    postId: match[2],
    url: trimmed,
  };
}

function numberPayload(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function stringPayload(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function metricSnapshotPayload(payload = {}) {
  return {
    like_count: Math.max(0, Number(numberPayload(payload, ["likeCount", "likes", "like_count"]) || 0)),
    reply_count: Math.max(0, Number(numberPayload(payload, ["replyCount", "replies", "reply_count"]) || 0)),
    repost_count: Math.max(0, Number(numberPayload(payload, ["repostCount", "reposts", "repost_count"]) || 0)),
    quote_count: Math.max(0, Number(numberPayload(payload, ["quoteCount", "quotes", "quote_count"]) || 0)),
    impression_count: Math.max(0, Number(numberPayload(payload, ["impressionCount", "impressions", "impression_count"]) || 0)),
  };
}

function hasProviderCredentials(verificationType) {
  if (String(verificationType || "").startsWith("x_")) return Boolean(process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN);
  if (String(verificationType || "").startsWith("telegram_")) return Boolean(process.env.TELEGRAM_BOT_TOKEN);
  if (String(verificationType || "").startsWith("discord_")) return Boolean(process.env.DISCORD_BOT_TOKEN);
  return true;
}

function getRequiredTerms(template) {
  const configured = template.metadata?.required_terms;
  if (Array.isArray(configured)) return configured.map(String).filter(Boolean);
  return String(template.verification_type || "").startsWith("x_") ? ["memewarzone"] : [];
}

function countRequiredUrls(payload, submittedValue) {
  const urls = Array.isArray(payload?.urls) ? payload.urls.map(String) : [submittedValue].filter(Boolean);
  return urls.filter((url) => /^https?:\/\/(x\.com|twitter\.com)\//i.test(url.trim())).length;
}

function validateSubmission(template, submittedValue, payload) {
  if (URL_SUBMISSION_TYPES.has(template.verification_type)) {
    const urls = Array.isArray(payload?.urls) ? payload.urls.map(String) : [submittedValue];
    const validUrls = urls.filter((url) => /^https?:\/\/(x\.com|twitter\.com)\//i.test(url.trim()));
    if (validUrls.length === 0) return "Submit a valid X post/reply/quote URL.";
  }

  if (template.verification_type === "docs_quiz") return "Use the quiz flow for documentation quests.";
  if (template.verification_type === "recruiter_application_submitted") return "Use the Command Center recruiter flow for this quest.";
  return "";
}

async function writeVerificationLog(input) {
  await pool.query(
    `
      insert into public.wm_verification_logs
        (user_id, quest_completion_id, provider, verification_type, status, message, metadata)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.userId || null,
      input.completionId || null,
      input.provider,
      input.verificationType,
      input.status,
      input.message,
      JSON.stringify(input.metadata || {}),
    ],
  ).catch(() => undefined);
}

async function createAdminNotification(input) {
  await pool.query(
    `
      insert into public.wm_admin_notifications
        (type, title, message, priority, status, related_user_id, related_completion_id, related_application_id)
      values ($1, $2, $3, $4, 'open', $5, $6, $7)
    `,
    [
      input.type,
      input.title,
      input.message || null,
      input.priority || "normal",
      input.relatedUserId || null,
      input.relatedCompletionId || null,
      input.relatedApplicationId || null,
    ],
  ).catch(() => undefined);
}

async function getTemplateBySlug(slug) {
  const { rows } = await pool.query(
    `select * from public.wm_quest_templates where slug = $1 and active = true limit 1`,
    [slug],
  );
  return rows[0] || null;
}

async function getLinkedXAccount(userId) {
  const { rows } = await pool.query(
    `
      select provider_user_id, username
      from public.wm_social_accounts
      where provider = 'x' and user_id = $1
      limit 1
    `,
    [userId],
  );
  return rows[0] || null;
}

async function evaluateSubmission(user, template, submittedValue, payload = {}) {
  const providerConfigured = hasProviderCredentials(template.verification_type);
  const basePayload = {
    ...(payload || {}),
    verification_type: template.verification_type,
    submitted_at: new Date().toISOString(),
    provider_configured: providerConfigured,
  };

  if (template.verification_type === "wallet_connect" || template.verification_type === "internal_event") {
    return {
      status: "verified",
      verificationPayload: { ...basePayload, manual_fallback: false },
      rejectionReason: null,
      shouldNotifyAdmin: false,
      notificationPriority: "normal",
    };
  }

  if (MANUAL_REVIEW_TYPES.has(template.verification_type) || template.metadata?.requires_admin_review === true) {
    const provider = String(template.verification_type || "").startsWith("x_")
      ? "x"
      : String(template.verification_type || "").startsWith("telegram_")
        ? "telegram"
        : String(template.verification_type || "").startsWith("discord_")
          ? "discord"
          : "manual";

    await writeVerificationLog({
      userId: user.id,
      provider,
      verificationType: template.verification_type,
      status: providerConfigured ? "queued_manual_review" : "provider_credentials_missing",
      message: providerConfigured ? "Submission requires manual review." : "Provider credentials are not configured; routed to manual review.",
      metadata: basePayload,
    });

    return {
      status: "review",
      verificationPayload: { ...basePayload, manual_fallback: true },
      rejectionReason: null,
      shouldNotifyAdmin: true,
      notificationPriority: template.metadata?.requires_admin_review === true || template.verification_type === "manual_review" ? "high" : "normal",
    };
  }

  if (template.verification_type === "x_reply_quality" || template.verification_type === "telegram_discord_activity") {
    return {
      status: "review",
      verificationPayload: { ...basePayload, manual_fallback: true },
      rejectionReason: null,
      shouldNotifyAdmin: true,
      notificationPriority: "normal",
    };
  }

  if (String(template.verification_type || "").startsWith("x_")) {
    const post = parseXPostUrl(String(submittedValue || ""));
    const linked = await getLinkedXAccount(user.id).catch(() => null);
    const linkedHandles = new Set([
      normalizeSocialHandle(linked?.provider_user_id || ""),
      normalizeSocialHandle(linked?.username || ""),
    ].filter(Boolean));
    const content = stringPayload(payload, ["content", "text", "postText", "caption"]);
    const requiredTerms = getRequiredTerms(template);
    const metrics = metricSnapshotPayload(payload);
    const minLikes = Number(template.metadata?.min_likes || 0);
    const minImpressions = Number(template.metadata?.min_impressions || 0);
    const minChars = Number(template.metadata?.min_chars || 0);
    const requiredUrls = Number(template.metadata?.required_urls || 0);
    const failures = [];
    const warnings = [];

    if (!post) failures.push("invalid_x_url");
    if (post && linkedHandles.size > 0 && !linkedHandles.has(post.username)) failures.push("x_ownership_mismatch");
    if (post && linkedHandles.size === 0) warnings.push("x_account_not_linked");
    if (requiredTerms.length > 0 && content && !requiredTerms.some((term) => content.toLowerCase().includes(term.toLowerCase()))) failures.push("missing_required_term");
    if (minChars > 0 && content && content.length < minChars) failures.push("content_too_short");
    if (requiredUrls > 0 && countRequiredUrls(payload, String(submittedValue || "")) < requiredUrls) failures.push("missing_required_urls");

    const hasMetricPayload = ["likeCount", "likes", "like_count", "impressionCount", "impressions", "impression_count"].some((key) => typeof payload[key] !== "undefined");
    const thresholdMet = (minLikes <= 0 || metrics.like_count >= minLikes) && (minImpressions <= 0 || metrics.impression_count >= minImpressions);

    let status = "review";
    if (failures.includes("invalid_x_url")) status = "rejected";
    else if (failures.length > 0) status = "review";
    else if (hasMetricPayload && thresholdMet && providerConfigured && template.metadata?.requires_admin_review !== true) status = "verified";
    else if (hasMetricPayload && !thresholdMet) status = "pending";

    return {
      status,
      verificationPayload: {
        ...basePayload,
        post,
        metrics,
        required_terms: requiredTerms,
        failures,
        warnings,
        manual_fallback: status !== "verified",
      },
      rejectionReason: status === "rejected" ? "Submit a valid X post URL." : failures[0] || null,
      shouldNotifyAdmin: status !== "verified",
      notificationPriority: template.metadata?.requires_admin_review === true ? "high" : "normal",
    };
  }

  const status = template.metadata?.requires_admin_review === true ? "review" : "pending";
  return {
    status,
    verificationPayload: { ...basePayload, manual_fallback: status !== "verified" },
    rejectionReason: null,
    shouldNotifyAdmin: status !== "verified",
    notificationPriority: template.metadata?.requires_admin_review === true ? "high" : "normal",
  };
}

async function recordMetricSnapshot(completionId, template, submittedValue, payload = {}) {
  if (!String(template.verification_type || "").startsWith("x_")) return;
  const post = parseXPostUrl(String(submittedValue || ""));
  const metrics = metricSnapshotPayload(payload);
  const content = stringPayload(payload, ["content", "text", "postText", "caption"]);
  await pool.query(
    `
      insert into public.wm_social_metric_snapshots
        (quest_completion_id, provider, external_post_id, like_count, reply_count, repost_count, quote_count, impression_count, raw_payload)
      values ($1, 'x', $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      completionId,
      post?.postId || null,
      metrics.like_count,
      metrics.reply_count,
      metrics.repost_count,
      metrics.quote_count,
      metrics.impression_count,
      JSON.stringify({
        ...payload,
        post_url: post?.url || submittedValue || null,
        post_username: post?.username || null,
        content_hash: content ? sha256(content.toLowerCase().replace(/\s+/g, " ").trim()) : null,
        provider_configured: hasProviderCredentials(template.verification_type),
      }),
    ],
  ).catch(() => undefined);
}

async function recordSubmissionFingerprints(userId, completionId, submittedValue, payload = {}) {
  const post = parseXPostUrl(String(submittedValue || ""));
  const content = stringPayload(payload, ["content", "text", "postText", "caption"]);
  const rows = [];
  if (post) rows.push({ type: "x_post_url", fingerprint: post.url.toLowerCase() });
  if (content) rows.push({ type: "content_hash", fingerprint: sha256(content.toLowerCase().replace(/\s+/g, " ").trim()) });

  for (const row of rows) {
    await pool.query(
      `
        insert into public.wm_submission_fingerprints
          (user_id, quest_completion_id, fingerprint_type, fingerprint)
        values ($1, $2, $3, $4)
        on conflict do nothing
      `,
      [userId, completionId, row.type, row.fingerprint],
    ).catch(() => undefined);
  }
}

async function getExistingCompletion(userId, instanceId) {
  const { rows } = await pool.query(
    `
      select *
      from public.wm_quest_completions
      where user_id = $1 and quest_instance_id = $2
      limit 1
    `,
    [userId, instanceId],
  );
  return rows[0] || null;
}

async function upsertCompletion({ userId, instanceId, existing, status, submittedValue, verificationPayload, rejectionReason }) {
  const now = new Date().toISOString();
  if (existing) {
    const { rows } = await pool.query(
      `
        update public.wm_quest_completions
        set status = $2,
            submitted_value = $3,
            verification_payload = $4::jsonb,
            rejection_reason = $5,
            verified_at = $6,
            updated_at = $7
        where id = $1
        returning *
      `,
      [
        existing.id,
        status,
        submittedValue || null,
        JSON.stringify(verificationPayload || {}),
        rejectionReason || null,
        status === "verified" ? now : null,
        now,
      ],
    );
    return rows[0] || existing;
  }

  const { rows } = await pool.query(
    `
      insert into public.wm_quest_completions
        (user_id, quest_instance_id, status, submitted_value, verification_payload, rejection_reason, verified_at, updated_at)
      values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      returning *
    `,
    [
      userId,
      instanceId,
      status,
      submittedValue || null,
      JSON.stringify(verificationPayload || {}),
      rejectionReason || null,
      status === "verified" ? now : null,
      now,
    ],
  );
  if (!rows[0]) throw new Error("Unable to create quest completion.");
  return rows[0];
}

export default async function wmQuestsSubmit(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const auth = readWarAuth(req);
  if (!auth) return unauthorized(res);

  try {
    const user = await getUserById(auth.userId);
    if (!user || user.wallet_address !== auth.address) return unauthorized(res, "War Missions session is no longer valid.");
    if (user.is_banned) return res.status(403).json({ error: "This wallet is excluded from War Missions." });

    const body = req.body || {};
    const questSlug = String(body.questSlug || "").trim();
    const submittedValue = typeof body.submittedValue === "string" ? body.submittedValue.trim() : "";
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    if (!questSlug) return res.status(400).json({ error: "Provide questSlug." });

    const template = await getTemplateBySlug(questSlug);
    if (!template) return res.status(404).json({ error: "Quest was not found." });

    const validationError = validateSubmission(template, submittedValue, payload);
    if (validationError) return res.status(400).json({ error: validationError });

    const instance = await ensureCurrentQuestInstance(template);
    const existing = await getExistingCompletion(user.id, instance.id);
    if (existing?.status === "verified") {
      const profile = await buildWarProfile(user);
      return res.status(200).json({ ok: true, completion: existing, status: existing.status, alreadyCompleted: true, profile });
    }

    const evaluation = await evaluateSubmission(user, template, submittedValue, payload);
    const completion = await upsertCompletion({
      userId: user.id,
      instanceId: instance.id,
      existing,
      status: evaluation.status,
      submittedValue,
      verificationPayload: evaluation.verificationPayload,
      rejectionReason: evaluation.rejectionReason,
    });

    await Promise.all([
      recordMetricSnapshot(completion.id, template, submittedValue, payload),
      recordSubmissionFingerprints(user.id, completion.id, submittedValue, payload),
    ]);

    if (evaluation.status === "verified") {
      await awardQuestForUser(user.id, template.slug, `quest_submit:${template.verification_type}`, evaluation.verificationPayload);
      await maybeVerifyReferralForUser(user.id).catch(() => undefined);
    } else {
      await writeVerificationLog({
        userId: user.id,
        completionId: completion.id,
        provider: String(template.verification_type || "").startsWith("x_") ? "x" : "war_missions",
        verificationType: template.verification_type,
        status: evaluation.status,
        message: evaluation.rejectionReason || "Submission is waiting for review or external verification.",
        metadata: evaluation.verificationPayload,
      });

      if (evaluation.shouldNotifyAdmin) {
        await createAdminNotification({
          type: "quest_review_requested",
          title: `${template.title} needs review`,
          message: evaluation.rejectionReason || submittedValue || `Verification type: ${template.verification_type}`,
          priority: evaluation.notificationPriority,
          relatedUserId: user.id,
          relatedCompletionId: completion.id,
        });
      }
    }

    const profile = await buildWarProfile(user);
    return res.status(200).json({ ok: true, completion, status: evaluation.status, alreadyCompleted: false, profile });
  } catch (error) {
    console.error("[war-missions/quests-submit] failed", error);
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
