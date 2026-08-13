import fs from "node:fs";

const libPath = "programs/memewarzone_solana/src/lib.rs";
const graduationPath = "programs/memewarzone_solana/src/graduation.rs";

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

let lib = fs.readFileSync(libPath, "utf8");
let graduation = fs.readFileSync(graduationPath, "utf8");

lib = replaceOnce(
  lib,
  `pub mod authorized_trade;\npub use authorized_trade::*;\n`,
  `pub mod authorized_trade;\npub use authorized_trade::*;\n\npub mod graduation;\npub use graduation::*;\n`,
  "graduation module export",
);

lib = replaceOnce(
  lib,
  `    /// Exact tokens in → SOL out from sol vault. Gross refund from curve; fee retained in vault.\n    pub fn sell_tokens(ctx: Context<SellTokens>, args: SellTokensArgs) -> Result<()> {\n        sell_tokens_handler(ctx, args)\n    }\n`,
  `    /// Exact tokens in → SOL out from sol vault. Gross refund from curve; fee retained in vault.\n    pub fn sell_tokens(ctx: Context<SellTokens>, args: SellTokensArgs) -> Result<()> {\n        sell_tokens_handler(ctx, args)\n    }\n\n    /// Starts an atomic graduation transaction and stages only the bounded DAMM v2 liquidity.\n    pub fn begin_graduation(\n        ctx: Context<BeginGraduation>,\n        args: BeginGraduationArgs,\n    ) -> Result<()> {\n        begin_graduation_handler(ctx, args)\n    }\n\n    /// Verifies the deterministic DAMM v2 pool + permanently locked position, then finalizes Campaign.\n    pub fn confirm_graduation(ctx: Context<ConfirmGraduation>) -> Result<()> {\n        confirm_graduation_handler(ctx)\n    }\n`,
  "program graduation handlers",
);

lib = replaceOnce(
  lib,
  `    #[msg("Trade authorization deadline has expired.")]\n    TradeAuthorizationExpired,\n}`,
  `    #[msg("Trade authorization deadline has expired.")]\n    TradeAuthorizationExpired,\n    #[msg("Solana campaign graduation is paused.")]\n    GraduationPaused,\n    #[msg("Signed graduation authorization is missing, malformed, or does not match this transaction.")]\n    InvalidGraduationAuthorization,\n    #[msg("Signed graduation authorization has expired.")]\n    GraduationAuthorizationExpired,\n    #[msg("Signed native graduation target is invalid.")]\n    InvalidGraduationTarget,\n    #[msg("Campaign has not reached the signed native graduation target or exhausted the bonding curve.")]\n    GraduationThresholdNotMet,\n    #[msg("Graduation must create/lock Meteora DAMM v2 and confirm in the same Solana transaction.")]\n    GraduationAtomicityRequired,\n    #[msg("The deterministic Meteora DAMM v2 customizable pool is invalid.")]\n    InvalidMeteoraPool,\n    #[msg("The deterministic Meteora DAMM v2 position is invalid.")]\n    InvalidMeteoraPosition,\n    #[msg("The Meteora DAMM v2 pool already exists before graduation begins.")]\n    MeteoraPoolAlreadyExists,\n    #[msg("The Meteora DAMM v2 position already exists before graduation begins.")]\n    MeteoraPositionAlreadyExists,\n    #[msg("Meteora graduation liquidity was not permanently locked.")]\n    MeteoraLiquidityNotLocked,\n    #[msg("Graduation staging token account must be empty before liquidity is released.")]\n    GraduationStagingNotEmpty,\n    #[msg("Graduation liquidity amount resolved to zero.")]\n    GraduationLiquidityZero,\n    #[msg("Graduation assets did not reconcile with the deterministic Meteora pool.")]\n    GraduationAssetMismatch,\n    #[msg("Meteora initial pool price drifted beyond the allowed bonding-curve tolerance.")]\n    GraduationPriceDrift,\n}`,
  "graduation errors",
);

graduation = replaceOnce(
  graduation,
  `fn validate_generation_binding(campaign: &Campaign, generation: &GenerationConfig) -> Result<()> {`,
  `fn validate_generation_binding(\n    campaign: &Campaign,\n    generation: &Account<'_, GenerationConfig>,\n) -> Result<()> {`,
  "generation Account binding",
);

fs.writeFileSync(libPath, lib);
fs.writeFileSync(graduationPath, graduation);
console.log("[graduation-finalizer] asserted transforms applied");
