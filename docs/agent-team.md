# Agent team

How Claude Code works on this project as a team of agents (issue #10). A
team is one **lead** session, which talks to the owner, plus **teammates**:
separate Claude sessions, each with its own context, a shared task list and
messages to each other. It uses Claude Code's experimental agent teams
(<https://code.claude.com/docs/en/agent-teams>).

## Setup

- **Turned on per user**, not in this repo: the owner's
  `~/.claude/settings.json` sets `"env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }`
  and `"teammateMode": "in-process"`. In-process is the only mode on Windows
  (split panes need tmux or iTerm2).
- **Roles live in `.claude/agents/`**, one file each. A file's `tools` limit
  what that teammate can do; its body is added to the teammate's
  instructions. Every teammate also loads this repo's `CLAUDE.md`, so the
  role files add only what is specific to the role.
- Claude Code reads the role files at start-up: restart it after changing
  one. `/agents` lists them.
- There is no team config file to keep. The team and its task list exist
  only while the session runs (`~/.claude/teams/`, `~/.claude/tasks/`).

## Roles

Chosen from both repos' documentation: the 18 slices of
`docs/phase-2-inventory.md`, the rules catalogue and owner rulings, the
decisions, and the old app's Security and Workflow notes.

| Role | Owns | Edits | Used for |
| --- | --- | --- | --- |
| `backend-dev` | `packages/domain`, `packages/db`, `tools/migrate` | those folders | almost every slice |
| `web-dev` | `apps/web`, both locales | that folder | slices 4-18 (pages, admin screens) |
| `qa` | acceptance criteria, parity with sportbet, rules lookup, E2E and smoke | test files only | every slice |
| `architect` | `CLAUDE.md` rules, `docs/decisions.md`, codebase health (`mp-code-review`, `improve-codebase-architecture`) | nothing | every slice |
| `security-reviewer` | the old app's Security rules applied to the new code | nothing | slices 4, 14, 17, and any auth, admin or deletion change |
| `devops` | `infra/`, `Dockerfile`, `.github/workflows/`, Vercel, Neon, Oracle | those; asks before any cloud change | infrastructure, the Oracle move, the switch-over |

Why these and not others:

- **One backend role**, not domain and db apart: the reader grows with every
  slice alongside the schema, so the two would mostly be messaging each
  other. For a large slice the lead can start two `backend-dev`s on
  different folders.
- **Rules lookup belongs to `qa`**: "does it do what sportbet does?" is the
  parity question.
- **Security is on demand**: three slices are sensitive (sign-in, admin,
  account deletion), the rest are not.
- **No designer yet**: the new app follows the old app's look until the
  owner sets a new one.

"Edits nothing" and "test files only" are instructions in the role, not a
hard lock: those roles keep Bash to run git and tests. The lead's review of
each change before committing is the check.

## Which team for which stage

Three to five teammates at a time; each one costs tokens.

| Stage | Team |
| --- | --- |
| Finish #9, then the parity checker (2.3) | backend-dev, qa, architect |
| Slice 4: sign-in, request context, layout, locales | backend-dev, web-dev, security-reviewer, qa, devops |
| Slices 5-12: player pages | backend-dev, web-dev, qa, architect |
| Slices 13, 14, 17: admin, users, profile | backend-dev, web-dev, security-reviewer, qa |
| Oracle move, switch-over (Phase 3) | devops, qa, architect |

## Working rules

- **The workflow does not change.** Brainstorm, spec and plan happen between
  the owner and the lead. The team runs the plan; the lead turns its tasks
  into the shared task list.
- **Each task goes:** developer (test first) -> `qa` (criteria and parity)
  -> `architect` (standards and spec) -> the lead commits.
- **Only the lead commits and pushes.** Work lands on `main`, so one
  committer means teammates never clash in git.
- **Each teammate stays in its own folders.** A change needed elsewhere goes
  to the owning teammate.
- **Rules are never invented.** A question the sources do not answer goes to
  the owner through the lead.
- **No production data** reaches any teammate. Only the owner runs the reader
  against production.
- **Owner steps** (Oracle resources, DNS, GitHub secrets, anything costing
  money) come one instruction at a time, and wait for the owner's yes.

## Starting and steering a team

- Start one by asking the lead in plain words, naming the roles, e.g.
  "Start an agent team for #9 with backend-dev, qa and architect."
- **Up/Down** picks a teammate in the agent panel, **Enter** opens it to
  read or message it, **Escape** interrupts it, **x** stops it, **Ctrl+T**
  shows the task list.
- `/model` and `/fast` change only the lead; `/effort` changes the teammate
  being viewed.
- To finish, ask the lead to shut the team down. A teammate finishes its
  current step before it exits.

Known limits: `/resume` and `/rewind` do not bring teammates back; one team
per session; teammates cannot start teammates of their own; the lead cannot
be handed over.
