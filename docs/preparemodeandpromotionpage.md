The proposal is not the style source. It is only a layout/UX reference. We should build the draft/promotion pages inside the current MemeWarzone frontend style: existing TopBar, current mwz-* HUD/button/panel classes, Tailwind/shadcn patterns, current page spacing, and current app shell. The proposal CSS should not be copied into the app.
I checked the current repo again: the TopBar already uses the current layout language like mwz-hud-frame, mwz-button, mwz-nav-link, existing search, wallet modal, and current nav structure. That is the shell we should extend, not replace.
Revised understanding
1. Promotion page uses current layout/style
The proposal page should be translated into current app components:
Proposal idea
Real implementation
Cinematic/dossier layout
Current MemeWarzone layout/cards
Proposal CSS
Do not import/copy
Proposal top nav
Do not use; current TopBar stays
Proposal buttons/pills
Rebuild using current mwz-button, mwz-panel, current Tailwind style
Proposal radar/metrics
Rebuild as current-style metric cards/pills
Proposal comments area
Build as current-style comments/comms section
So we keep the structure and product ideas, but make it feel native to the app.

2. Comments section is part of the promotion page
Yes, I saw it. In the proposal it appears as “The Bunker” in Variation A and “Transmissions” in Variation B. The section includes reactions/comments/replies-style activity.
For the real app, I would implement it as:
Draft Comms / War Room / The Bunker
Functionally:
Feature
MVP behavior
View comments
public for public/unlisted drafts
Add comment
requires wallet/sign-in
Like/upvote/react comment
requires wallet/sign-in
Comment count
feeds popularity score
Recent activity
feeds popularity score
Abuse/spam controls
later admin layer
This should not be a fake static design section. It should become real engagement data for the draft.

3. Draft follow/watchlist should reuse current follow logic
Yes, we should reuse the same mental model as campaign following.
But there is one technical issue: the current followApi.ts validates campaignAddress with ethers.isAddress(), so a draft ID or slug will fail if we push it through the existing campaign-follow function unchanged.
So the right approach is:
Keep
Change
existing campaign follow UX pattern
add draft target support
existing “followed campaigns” profile concept
extend to followed drafts
existing API style
add targetType: draft or separate draft-follow endpoint
existing wallet-required follow behavior
keep it
Best implementation:
targetType: "campaign" | "draft" | "profile"
targetId: campaignAddress | draftId | walletAddress
But under the hood, we can still reuse the existing follow tables/API pattern.

4. Popularity percentage should be calculated from engagement
The radar and metric pills should not just be decoration. They should calculate a draft popularity/heat score from real user activity.
Inputs:
Signal
Weight idea
Follows/watchlists
high
Unique commenters
high
Total comments
medium
Reactions/upvotes
medium
Shares/copy-link clicks
medium
Profile/sign-in intent
medium
Views
low, because easier to inflate
MVP popularity score:
popularityScore =
  weightedFollows +
  weightedUniqueCommenters +
  weightedComments +
  weightedReactions +
  weightedShares +
  weightedSignedInActions +
  weightedViews
Then normalize it to a percentage:
Score
Display
0–20
Cold
21–50
Building
51–75
Heating Up
76–90
Hot
91–100
Warzone Trending
Important: keep the exact formula server-side so people cannot easily game it.

5. Sign in/up should be part of promotion engagement
Correct. The public draft page should use sign-in/connect prompts around:
Action
Requires wallet/sign-in?
Follow/watch draft
Yes
Comment
Yes
React/upvote comment
Yes
Join/arm launch alert
Yes, or email/wallet depending MVP
Share/copy link
No, but track if possible
View page
No
So when users click Follow, Comment, React, or Arm notification, we use the existing wallet/connect modal flow.

6. Notifications should be a TopBar bell pill, not only Profile tab
Agree. The Profile page already has a notifications tab type in the repo, so the placeholder exists conceptually.
But the better UX is:
Surface
Purpose
TopBar bell pill
quick unread count + dropdown
Profile notifications tab
full notification history
Notification badge
unread lifecycle events
The TopBar already has a right-side action area with Create Coin and wallet buttons, so the notification pill should go between Create Coin and Wallet or next to the wallet button.
TopBar MVP:
<Button className="mwz-button h-10 px-3">
  <Bell className="h-4 w-4" />
  {unreadCount > 0 && <span>{unreadCount}</span>}
</Button>
Dropdown items:
Notification
Someone followed your draft
Someone commented on your draft
Draft reached Hot status
Promotion page published
Draft ready to push live
Draft pushed live
Followed draft went live

Updated build phases with your corrections
Phase PM-0 — Integration rules freeze
Before coding, lock these rules:
Rule
Final
Use proposal CSS
No
Use current app CSS/layout
Yes
Keep current TopBar
Yes
Use proposal as component/layout reference only
Yes
Comments section included
Yes
Follows feed popularity
Yes
Sign-in actions feed popularity
Yes
Notifications in TopBar bell
Yes
Profile notifications tab remains full view
Yes

Phase PM-1 — Draft DB/API foundation
Same as before, but add engagement tables now.
Build:
Table/API
campaign_drafts
campaign_draft_promotion
campaign_draft_comments
campaign_draft_reactions
campaign_draft_metrics
draft follow/watchlist support
notification records
Acceptance:
Check
Drafts save without gas
Ticker uniqueness enforced
Public/unlisted/private rules work
Draft comments can be stored
Draft follows can be stored
Draft metrics can be calculated

Phase PM-2 — Current-style Create Draft flow
Build into the current Create page.
Acceptance:
Check
Prepare Mode creates draft
Live Mode has Create Live + Create Draft
No gas prompt for drafts
Duplicate ticker blocked
10 draft limit enforced
3 live campaign limit only blocks live creation

Phase PM-3 — Current-style Promotion Setup page
Route:
/drafts/:draftId/promotion
Use owner-view proposal only as layout reference, but implement with current panels/buttons.
Sections:
Section
Draft identity
Mission statement
Roadmap / battle plan
Launch strategy
Community links
Docs links
Banner/logo
Visibility
Share message
Readiness checklist
Acceptance:
Check
No proposal CSS imported
Page matches current MemeWarzone app style
Creator can save/publish
Creator can preview public page
Visibility can change

Phase PM-4 — Current-style Public Promotion Page
Route:
/prepare/:slug
Sections:
Section
Draft hero
Status / Prepare Mode badge
Popularity radar/heat pills
Follow/watch button
Sign in/up CTA
Mission
Roadmap
Launch strategy
Community links
Docs
Creator note
Comments / The Bunker
Share CTA
Acceptance:
Check
Current TopBar remains
No trading UI appears
Follow works
Comments work
Popularity score updates
Sign-in/connect prompts work

Phase PM-5 — Draft follow/watchlist integration
Do not force draft follows through campaignAddress.
Build:
Item
generic follow target API or draft-follow API
useFollowTarget() hook
draft follow count
followed drafts in profile
campaign follow backwards compatibility
Acceptance:
Check
Campaign following still works
Draft following works without EVM address
Follow count appears on promotion page
Follow action feeds popularity score

Phase PM-6 — Comments / “The Bunker”
Build:
Item
comment list
add comment
react/upvote comment
reply support optional
wallet/sign-in gate
moderation-ready schema
Acceptance:
Check
Users can comment on public/unlisted drafts
Private drafts block non-owner access
Comments feed popularity
Reactions feed popularity
Creator can see comments on their draft

Phase PM-7 — Popularity engine
Build server-side calculation.
Inputs:
Input
views
follows/watchlists
comments
unique commenters
reactions
shares
signed-in actions
Outputs:
Output
popularity percentage
heat label
ranking score
public metric pills
frontpage sort signal
Acceptance:
Check
Score cannot be controlled only by views
Wallet-based actions matter more
Draft cards can sort by popularity
Promotion page radar/pills use real metrics

Phase PM-8 — TopBar notification pill
Build into current TopBar.
TopBar location:
Create Coin | Bell Pill | Wallet
Acceptance:
Check
Bell icon appears when connected
Unread count displays
Dropdown opens recent notifications
Click goes to target
“View all” goes to /profile?tab=notifications

Phase PM-9 — Profile notification tab
Use the existing placeholder/tab direction.
Build:
Item
notification list
unread/read state
mark read
mark all read
click notification target
Acceptance:
Check
Profile tab works
TopBar count syncs
Draft lifecycle notifications show
Comment/follow notifications show

Phase PM-10 — Frontpage Upcoming Drafts
Use current campaign grid style, not proposal CSS.
Acceptance:
Check
Drafts appear separate from live campaigns
Draft cards show Prepare Mode
Draft cards show followers/comments/popularity
Draft cards do not show market cap/chart/liquidity/buy CTA

Phase PM-11 — Profile Drafts tab
Add a real drafts tab or fold into existing profile layout.
Acceptance:
Check
Owner sees all drafts
Other users see public drafts only
Owner can edit/publish/archive/push live
Followed drafts appear under following

Phase PM-12 — Push Live flow
Same as before.
Acceptance:
Check
Draft deploys into real campaign
Draft cannot deploy twice
Max 3 active live campaigns enforced
Promotion page remains after deployment
Promotion page links to TokenDetails

Important correction to the previous plan
The previous “Promotion design system integration” phase should be replaced.
Old idea:
Bring proposal CSS/design system into the frontend.
New correct idea:
Translate the proposal layout into the existing MemeWarzone app style and reuse current CSS/components.
So the new rule is:
Do not import frontend/promotion-page-proposal/styles.css.
Do not copy its root variables.
Do not replace current app shell.
Use it only as a visual/layout reference.
The next best step is PM-0 + PM-1: freeze these corrected integration rules, then build the draft DB/API with comments, follows, metrics, and notification hooks included from the start.
