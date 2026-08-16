export type AbuseReportPrefill = {
  entityType?: string;
  reportedWallet?: string;
  reportedCampaignAddress?: string;
  reportedTokenAddress?: string;
  reportedUrl?: string;
  category?: string;
};

export function buildAbuseReportPath(prefill: AbuseReportPrefill = {}) {
  const qs = new URLSearchParams();
  if (prefill.entityType) qs.set("entity", prefill.entityType);
  if (prefill.reportedWallet) qs.set("wallet", prefill.reportedWallet);
  if (prefill.reportedCampaignAddress) qs.set("campaign", prefill.reportedCampaignAddress);
  if (prefill.reportedTokenAddress) qs.set("token", prefill.reportedTokenAddress);
  if (prefill.reportedUrl) qs.set("url", prefill.reportedUrl);
  if (prefill.category) qs.set("category", prefill.category);
  const suffix = qs.toString();
  return suffix ? `/command/support/report?${suffix}` : "/command/support/report";
}
