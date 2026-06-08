# Idea: Add "Spectator Mode" to Arena Battles

## Background
Currently in MemeWarzone, arena battles are only visible to the two participants. Community members have asked for the ability to watch ongoing battles in real time without participating.

## Goals
- Let any logged-in user enter "spectator" mode for a battle
- Real-time updates of the battle state (moves, health, events)
- Spectator count visible to participants
- No ability for spectators to influence the outcome

## Non-Goals (for this effort)
- VOD replays / recorded battles (future phase)
- Chat among spectators (future)
- Mobile-specific spectator UI (use existing responsive patterns)

## Constraints
- Must use existing Ably realtime infrastructure (see api/ably and current battle event code)
- Must not increase load on the main battle execution path
- New UI should feel native to the existing arena experience

## Success Looks Like
A user can click "Watch" on an active arena battle from the lobby, see a read-only view of the battle UI updating live, and see the spectator count increment for the fighters.
