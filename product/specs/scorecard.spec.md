# Spec — Scorecard

**Last Updated:** 2026-03-03
**Atomic Level:** Page (ScorecardView) + Organism (ScorecardTable)

---

## Purpose
Shows a live overview of who has claimed which tasks. Visibility is controlled by the initiator.

## Route
`/groups/:id/scorecard` — accessible based on group `scorecardVisibility` setting.

## Visibility Rules
| Setting | Who can see |
|---|---|
| `all` | Any member with the share link |
| `selected` | Users whose ID is in `scorecardVisibleTo` array |
| `initiator` | Only the authenticated initiator |

Frontend enforces this by checking the group's `scorecardVisibility` field and the current user/session. Backend also enforces it.

## Components

### ScorecardView [PAGE]
- Fetches `scorecard` data via `useClaims.fetchClaims(groupId)`
- Checks visibility access; shows "Niet beschikbaar" message if not allowed
- Renders `ScorecardTable`
- Refresh button (manual re-fetch)
- i18n keys: `scorecard.*`

### ScorecardTable [ORGANISM]
Props:
- `rows: ScorecardRow[]` (required)
- `tasks: Task[]` (required) — for column headers
Emits: none

Layout: table with participants as rows, tasks as columns. Checkmark (claimed) or dash (not claimed) per cell. Shows task title truncated in column header.

### ScorecardEmptyState [MOLECULE]
Props:
- `visible: boolean`
Slot: default — message text

## Acceptance Criteria
- [ ] Scorecard route accessible to members when visibility = 'all'
- [ ] Scorecard hidden with error message when member tries to access visibility = 'initiator'
- [ ] Table shows all participants (anonymous + registered) as rows
- [ ] Table shows all tasks as columns
- [ ] Claimed cell shows checkmark; unclaimed shows dash
- [ ] Refresh button re-fetches data
- [ ] Loading spinner shown during fetch
