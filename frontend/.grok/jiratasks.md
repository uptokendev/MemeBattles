DEV-XX — Solana Draft Chain Support
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Prepare Mode is already live on the dev branch and currently assumes an EVM wallet flow. Drafts, promotion pages and prepare pages already exist, but Solana creators cannot participate because chain handling is EVM-only.
The goal is not to launch Solana tokens yet.
The goal is to allow Solana creators to create and manage Prepare Mode drafts before launch functionality is implemented.
Goal
Support Solana wallets (via Phantom) for Prepare Mode drafts transparently alongside BNB/EVM. The UI, flow, and behaviour are identical regardless of wallet type. The connected wallet (EVM or Solana) is detected automatically with no user-facing selection, badges, or differences in copy/text/buttons.
Acceptance Criteria (TDD where possible)
Internal Solana chain IDs supported (101 mainnet, 102 devnet or agreed equivalent) 
Draft records can be created with Solana chain IDs and Solana owner pubkeys (when Solana wallet active) 
Ticker validation supports Solana chain IDs 
Existing BNB/BSC draft flow remains unchanged (identical UI/behaviour) 
No deploy functionality exposed for Solana drafts (same locked UI as EVM) 
Verification
Create draft using BNB/EVM wallet (standard flow) 
Create draft using Solana/Phantom wallet (exact same UI and steps) 
Same ticker can be validated correctly according to the active wallet's chain 
Existing BNB flow passes regression with no behaviour change 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Solana Wallet Connect
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Prepare Mode currently depends on EVM wallet infrastructure.
Solana creators need wallet connectivity to create and manage drafts.
Goal
Support Phantom (Solana) wallets transparently alongside EVM wallets for Prepare Mode. No difference in connection UI or flow; the active connected wallet (EVM or Solana) determines the type automatically.
Acceptance Criteria (TDD where possible)
Phantom wallet supported (in addition to EVM wallets) 
Injected Solana provider detection implemented 
User can connect Solana wallet (via the same wallet button) 
User can disconnect Solana wallet 
Solana public key available throughout draft flow when Phantom is the active wallet 
Existing EVM wallet flow remains unchanged 
Verification
Connect Phantom (Solana address shown/used) 
Disconnect Phantom 
Use either wallet type for draft creation 
Verify correct pubkey/chain used based on active wallet 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Solana Draft Authentication
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Current draft authorization only supports EVM message signing through ethers.
Prepare Mode draft ownership and protected actions require wallet authentication.
Goal
Support Solana message signing for draft authorization (ed25519) transparently when a Solana wallet is active. Same auth UI/flow as EVM.
Acceptance Criteria (TDD where possible)
Draft auth supports Solana (ed25519) when Solana wallet active 
Solana wallets can sign Prepare Mode messages 
Backend verifies ed25519 signatures 
Nonce flow supports Solana public keys 
Existing EVM verification remains unchanged 
Invalid Solana signatures rejected 
Verification
Sign valid draft action with Phantom 
Verify protected action succeeds 
Verify invalid signature rejected 
Verify replay attack prevented through nonce 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Solana Draft Creation
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Draft creation currently assumes EVM wallets and signer availability.
Once Solana authentication exists, creators should be able to create drafts exactly like BSC creators.
Goal
Enable draft creation for Solana wallets using the exact same UI and flow as BNB/EVM. Automatic based on connected wallet type.
Acceptance Criteria (TDD where possible)
Creator using Solana wallet can create draft (same flow as EVM) 
Logo upload works when using Solana wallet 
Draft stores Solana public key as owner (when Solana wallet used) 
Draft stores Solana chain ID (when Solana wallet used) 
Draft redirects to promotion setup after creation (same for both) 
Existing BSC draft creation remains unchanged 
Verification
Create draft using BNB/EVM wallet 
Create draft using Solana/Phantom wallet 
Upload logo (works for both) 
Confirm draft ownership and chain stored correctly 
Confirm draft visible in draft list 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Solana Promotion Page Support
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Promotion setup and Prepare pages already exist but ownership validation currently assumes EVM wallets.
Goal
Allow creators using Solana wallets to manage and publish Prepare pages using the exact same UI and flow as BNB/EVM.
Acceptance Criteria (TDD where possible)
Draft owner (Solana or EVM) can access promotion setup (same flow) 
Save promotion works (for both wallet types) 
Publish promotion works (for both) 
Public Prepare page renders correctly 
Ownership validation enforced based on active wallet type 
Existing BSC flow remains unchanged 
Verification
Create draft with either wallet type 
Configure promotion page (same UI) 
Publish Prepare page 
Access page anonymously 
Verify unauthorized edit blocked (based on wallet type) 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Solana Prepare Mode UI
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Users must clearly understand that Solana is available only for Prepare Mode and not yet for token deployment.
Goal
Ensure the UI and messaging are identical for BNB/EVM and Solana wallet users. No visible differences or Solana-specific badges/copy (flow is seamless and automatic).
Acceptance Criteria (TDD where possible)
No Solana-specific badges or options in create/promotion/prepare flows 
Prepare page and drafts render the same regardless of wallet type 
UI copy is generic (no implication of differences) 
Draft-only nature communicated consistently (same for all) 
No UI implies live deployment is available (same messaging) 
Verification
Review create flow (identical for both wallet types) 
Review promotion flow 
Review Prepare page 
Confirm no wallet-type specific UI elements or copy 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Block Solana Push Live
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
The current Push Live flow is built exclusively around the existing EVM launch pipeline.
Solana deployment infrastructure does not yet exist.
Goal
Prevent drafts created with Solana wallets from entering deployment flows (while keeping the UI/CTA the same as for BNB/EVM).
Acceptance Criteria (TDD where possible)
Push Live / deploy detects Solana-wallet drafts (via chain/owner) and blocks 
Solana-wallet drafts cannot call deployment endpoints 
Backend rejects deploy attempts for Solana-wallet drafts (same "locked" UI as EVM) 
Existing BSC deploy flow remains unchanged 
Verification
Create draft with Solana wallet 
Open Push Live (shows same locked state) 
Attempt direct API deploy call for Solana draft 
Verify backend rejection 
Verify BNB/EVM deploy still works 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean
