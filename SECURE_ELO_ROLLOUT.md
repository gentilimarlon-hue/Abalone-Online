# Secure accounts and Elo rollout

This feature is developed on `feature/secure-accounts-elo`. It is intentionally not merged into `main` and does not affect the live game.

## Current scope

- Adds a link from a player profile to a Supabase Auth user.
- Adds a profile trigger for newly registered email/password accounts.
- Adds a private RPC for reading the authenticated player's profile.
- Adds a service-role-only, idempotent Elo settlement foundation (K=32).
- Adds a unique rated-match record per room and rating-history rows.

## Important: Elo is NOT enabled yet

The settlement function is deliberately inaccessible to browser clients. It must only be called by a trusted game server after the complete match has been independently replayed and validated. The current `abalone_submit_state` function trusts browser-supplied state and winner values; it must not be used to decide rated results.

The migration does not automatically claim existing passwordless profiles based on public usernames. Such claiming would allow account takeover. Existing profiles need an explicit verified migration/recovery flow.

## Apply the database foundation

1. Open Supabase Dashboard → SQL Editor.
2. Review and run `supabase/migrations/202611090001_secure_accounts_elo_foundation.sql`.
3. Do not delete or replace the existing room functions.
4. Do not enable client-side rating updates.

New auth users must include a `username` in Supabase Auth user metadata. Configure Auth → URL Configuration with the deployed app URL and redirect URL.

## Remaining before a rated public release

- Implement the email/password UI using Supabase Auth.
- Add a verified account-claim flow for existing player profiles.
- Implement an authoritative server-side Abalone move engine, including the project's bomb rules and mini-board variant.
- Change room creation/join so the server binds authenticated player IDs to black/white seats.
- Replace browser-submitted full states with server-validated move commands.
- Have the trusted server finalize a room and call `abalone_settle_validated_match` once.
- Add tests for legal/illegal moves, forged winners, out-of-turn moves, duplicate settlement, abandoned games, and rating arithmetic.
- Only then merge and deploy the feature.

## Rating policy

Initial rating 270, K=32, zero-sum rating changes. A rated match is one completed server-validated online game between two distinct registered accounts. Guests and abandoned games are unranked.
