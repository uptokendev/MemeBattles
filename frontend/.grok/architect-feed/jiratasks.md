DEV-XX — Solana Draft Chain Support
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Prepare Mode is already live on the dev branch and currently assumes an EVM wallet flow. Drafts, promotion pages and prepare pages already exist, but Solana creators cannot participate because chain handling is EVM-only.
The goal is not to launch Solana tokens yet.
The goal is to allow Solana creators to create and manage Prepare Mode drafts before launch functionality is implemented.
Goal
Introduce Solana as a draft-only chain throughout Prepare Mode.
Acceptance Criteria (TDD where possible)
Solana chain option available in /create 
Internal Solana chain IDs supported (101 mainnet, 102 devnet or agreed equivalent) 
Draft records can be created with Solana chain IDs 
Ticker validation is scoped per chain 
Existing BNB/BSC draft flow remains unchanged 
No deploy functionality exposed through this task 
Verification
Create draft on BSC 
Create draft on Solana 
Same ticker can be validated correctly according to chain rules 
Existing BSC flow passes regression 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Solana Wallet Connect
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Prepare Mode currently depends on EVM wallet infrastructure.
Solana creators need wallet connectivity to create and manage drafts.
Goal
Add Solana wallet connectivity for Prepare Mode.
Acceptance Criteria (TDD where possible)
Phantom wallet supported 
Injected Solana provider detection implemented 
User can connect Solana wallet 
User can disconnect Solana wallet 
Public key available throughout draft flow 
Existing EVM wallet flow remains unchanged 
Verification
Connect Phantom 
Disconnect Phantom 
Switch between EVM and Solana wallet 
Verify public key available in draft creation flow 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Solana Draft Authentication
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Current draft authorization only supports EVM message signing through ethers.
Prepare Mode draft ownership and protected actions require wallet authentication.
Goal
Support Solana message signing for draft authorization.
Acceptance Criteria (TDD where possible)
Draft auth supports walletType=solana 
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
Enable Solana draft creation.
Acceptance Criteria (TDD where possible)
Solana creator can create draft 
Logo upload works for Solana drafts 
Draft stores Solana public key as owner 
Draft stores Solana chain ID 
Draft redirects to promotion setup after creation 
Existing BSC draft creation remains unchanged 
Verification
Create Solana draft 
Upload logo 
Confirm draft ownership 
Confirm draft visible in draft list 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Solana Promotion Page Support
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Promotion setup and Prepare pages already exist but ownership validation currently assumes EVM wallets.
Goal
Allow Solana creators to manage and publish Prepare pages.
Acceptance Criteria (TDD where possible)
Solana draft owner can access promotion setup 
Save promotion works 
Publish promotion works 
Public Prepare page renders correctly 
Solana ownership validation enforced 
Existing BSC flow remains unchanged 
Verification
Create draft 
Configure promotion page 
Publish Prepare page 
Access page anonymously 
Verify unauthorized edit blocked 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Solana Prepare Mode UI
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
Users must clearly understand that Solana is available only for Prepare Mode and not yet for token deployment.
Goal
Add Solana-specific UI and messaging.
Acceptance Criteria (TDD where possible)
Solana chain badge visible where applicable 
Prepare page displays Solana network correctly 
Draft pages indicate Solana status 
UI copy clearly communicates draft-only support 
No UI implies live deployment is available 
Verification
Review create flow 
Review promotion flow 
Review Prepare page 
Confirm messaging consistency 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean

DEV-XX — Block Solana Push Live
Description
Context
Repo: uptokendev/MemeBattles · Branch: dev · Epic: Solana Prepare Mode
The current Push Live flow is built exclusively around the existing EVM launch pipeline.
Solana deployment infrastructure does not yet exist.
Goal
Prevent Solana drafts from entering deployment flows.
Acceptance Criteria (TDD where possible)
Push Live detects Solana drafts 
Solana drafts cannot call deployment endpoints 
Deploy CTA replaced with launch-soon messaging 
Backend rejects Solana deploy attempts 
Existing BSC deploy flow remains unchanged 
Verification
Open Push Live for Solana draft 
Confirm deploy unavailable 
Attempt direct API deploy call 
Verify backend rejection 
Verify BSC deploy still works 
Definition of Done
Tests/smoke pass · spec-review clean · code-quality-review clean
