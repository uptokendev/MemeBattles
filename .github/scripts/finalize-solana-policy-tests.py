from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


rust = "programs/memewarzone_solana/src/authorized_trade.rs"
replace_once(
    rust,
    '''    #[test]
    fn explicit_risk_manual_review_blocks_trade() {
        let trader = Pubkey::new_unique();
        let risk = RiskProfile {
            wallet: trader,
            risk_level: 1,
            restricted: false,
            cluster_id: [0; 32],
            manual_review_required: true,
            bump: 1,
        };
        assert!(validate_trade_risk_profile(&risk, trader).is_err());
    }

''',
    "",
)

backend_test = "frontend/api/dev-fix/solana-trade-preflight-final.test.mjs"
replace_once(
    backend_test,
    '''test("trade authorization is fail-closed before route signing", () => {
  for (const marker of [
    "SOLANA_WALLET_RESTRICTED",
    "SOLANA_WALLET_MANUAL_REVIEW",
    "SOLANA_CLUSTER_RESTRICTED",
    "SOLANA_LAUNCHPAD_PAUSED",
    "SOLANA_BUYS_PAUSED",
    "SOLANA_SELLS_PAUSED",
    "SOLANA_TRADE_SECURITY_NOT_LOCKED",
    "SOLANA_ROUTE_SIGNER_ONCHAIN_MISMATCH",
    "SOLANA_REWARD_VAULTS_NOT_READY",
  ]) assert.match(auth, new RegExp(marker));

  before("await assertTradeGlobalPreflight", "const signature = signer.sign(digest)");
  before("await assertRewardVaultPreflight", "const signature = signer.sign(digest)");
  before("await resolveTraderClusterProfile", "const signature = signer.sign(digest)");
});
''',
    '''test("trade authorization is fail-closed before route signing", () => {
  for (const marker of [
    "SOLANA_LAUNCHPAD_PAUSED",
    "SOLANA_BUYS_PAUSED",
    "SOLANA_SELLS_PAUSED",
    "SOLANA_TRADE_SECURITY_NOT_LOCKED",
    "SOLANA_ROUTE_SIGNER_ONCHAIN_MISMATCH",
    "SOLANA_REWARD_VAULTS_NOT_READY",
  ]) assert.match(auth, new RegExp(marker));

  for (const code of [
    "SOLANA_WALLET_RESTRICTED",
    "SOLANA_WALLET_MANUAL_REVIEW",
    "SOLANA_CLUSTER_RESTRICTED",
  ]) {
    assert.match(
      auth,
      new RegExp(`${code}[\\s\\S]{0,220}httpStatus: 403`),
      `${code} must remain an HTTP 403 preflight rejection`,
    );
  }

  const sign = "const signature = signer.sign(digest)";
  before("await assertTradeGlobalPreflight", sign);
  before("await assertRewardVaultPreflight", sign);
  before("await resolveTraderClusterProfile", sign);
  before("assertCurveOpen", sign);
  before("await resolveRouteProfile", sign);
  assert.equal(auth.indexOf(sign), auth.lastIndexOf(sign), "authorization digest must be signed in exactly one place");
});
''',
)

print("Solana policy test cleanup applied")
