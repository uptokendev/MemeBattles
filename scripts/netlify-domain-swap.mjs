#!/usr/bin/env node
// Move a custom domain between two Netlify sites at launch.
//
// Usage:
//   NETLIFY_PAT=nfp_xxx \
//   COUNTDOWN_SITE_ID=xxxxxxxx-xxxx-xxxx \
//   PLATFORM_SITE_ID=yyyyyyyy-yyyy-yyyy \
//   DOMAIN=memebattles.tld \
//     node scripts/netlify-domain-swap.mjs [--dry-run] [--rollback]
//
// Flags:
//   --dry-run   Print intended PATCH calls without executing them.
//   --rollback  Reverse the swap (platform -> countdown).
//
// Notes:
//   - A custom domain can only live on one Netlify site at a time, so this
//     removes it from the source site before adding it to the target.
//   - SSL is reissued by Netlify after the second PATCH; brief cert warnings
//     are possible for ~1-5 minutes.

const API = 'https://api.netlify.com/api/v1';

const env = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
  return v;
};

const PAT = env('NETLIFY_PAT');
const COUNTDOWN_SITE_ID = env('COUNTDOWN_SITE_ID');
const PLATFORM_SITE_ID = env('PLATFORM_SITE_ID');
const DOMAIN = env('DOMAIN');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ROLLBACK = args.includes('--rollback');

const [fromSiteId, toSiteId] = ROLLBACK
  ? [PLATFORM_SITE_ID, COUNTDOWN_SITE_ID]
  : [COUNTDOWN_SITE_ID, PLATFORM_SITE_ID];

const headers = {
  Authorization: `Bearer ${PAT}`,
  'Content-Type': 'application/json',
};

const getSite = async (id) => {
  const res = await fetch(`${API}/sites/${id}`, { headers });
  if (!res.ok) {
    throw new Error(`GET site ${id} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
};

const patchSite = async (id, body) => {
  const res = await fetch(`${API}/sites/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PATCH site ${id} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
};

const describe = (label, site) =>
  `${label} "${site.name}" custom_domain=${site.custom_domain ?? 'null'} aliases=${JSON.stringify(site.domain_aliases ?? [])}`;

const log = (msg) => console.log(`[netlify-domain-swap] ${msg}`);

log(`mode=${ROLLBACK ? 'rollback' : 'forward'} dry-run=${DRY_RUN}`);
log(`moving ${DOMAIN}: ${fromSiteId} -> ${toSiteId}`);

const [fromSite, toSite] = await Promise.all([getSite(fromSiteId), getSite(toSiteId)]);
log(describe('from-site', fromSite));
log(describe('to-site  ', toSite));

const fromAliases = fromSite.domain_aliases ?? [];
const fromHasDomain = fromSite.custom_domain === DOMAIN || fromAliases.includes(DOMAIN);
const toHasDomain = toSite.custom_domain === DOMAIN;

if (!fromHasDomain && toHasDomain) {
  log(`nothing to do — ${DOMAIN} already on target site`);
  process.exit(0);
}

const removeBody = fromHasDomain
  ? {
      domain_aliases: fromAliases.filter((d) => d !== DOMAIN),
      ...(fromSite.custom_domain === DOMAIN ? { custom_domain: null } : {}),
    }
  : null;
const addBody = toHasDomain ? null : { custom_domain: DOMAIN };

if (DRY_RUN) {
  log('DRY RUN — would issue:');
  if (removeBody) log(`  1) PATCH ${fromSiteId} ${JSON.stringify(removeBody)}`);
  if (addBody) log(`  2) PATCH ${toSiteId}   ${JSON.stringify(addBody)}`);
  process.exit(0);
}

if (removeBody) {
  log(`removing ${DOMAIN} from ${fromSiteId}…`);
  await patchSite(fromSiteId, removeBody);
}

if (addBody) {
  log(`adding ${DOMAIN} to ${toSiteId}…`);
  await patchSite(toSiteId, addBody);
}

log('done. SSL reissue may take a few minutes.');
