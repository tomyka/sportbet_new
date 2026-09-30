# Agent team

How Claude Code works on this project as a team of agents (issue #10). A
team is one **lead** session, which talks to the owner, plus **teammates**:
separate Claude sessions, each with its own context, a shared task list and
messages to each other. It uses Claude Code's experimental agent teams
(<https://code.claude.com/docs/en/agent-teams>).

## Setup

- **Turned on per user**, not in this repo: the owner's
  `~/.claude/settings.json` sets `"env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }`
  and `"teammateMode": "in-process"`. In-process runs every teammate in the
  one terminal; split panes need tmux or iTerm2, which Windows Terminal and
  VS Code's terminal do not provide.
- **Roles live in `.claude/agents/`**, one file each. A file's `tools` limit
  what that teammate can do, and its body is added to the teammate's
  instructions. Every teammate also loads `CLAUDE.md`, and each role file
  points to this document, so the rules below are written once, here.
- Claude Code watches `.claude/agents/` and picks up edits within seconds.
  Only the directory's first creation needs a restart. `/agents` lists the
  roles.
- There is no team config to keep in the repo. The team's runtime config
  (`~/.claude/teams/`) is removed when the session ends; its task list
  (`~/.claude/tasks/`) stays, so a resumed session keeps its tasks.

## Roles

Chosen from both repos' documentation: the 18 slices of
`docs/phase-2-inventory.md`, the rules catalogue and owner rulings, the
decisions, and the old app's Security and Workflow notes.

| Role | Owns | Edits | Used for |
| --- | --- | --- | --- |
| `backend-dev` | `packages/domain`, `packages/db`, `tools/migrate` | those folders | almost every slice |
| `web-dev` | `apps/web`, both locales | that folder | slices 4-18 (pages, admin screens) |
| `qa` | acceptance criteria, parity with sportbet, rules lookup, E2E and smoke | test files only | every slice |
| `architect` | `CLAUDE.md` rules, `docs/decisions.md`, codebase health (`mp-code-review`, `improve-codebase-architecture`) | nothing in the repo | every slice |
| `security-reviewer` | the old app's Security rules applied to the new code | nothing | slices 4, 14, 17, and any auth, admin, deletion or mail change |
| `devops` | `infra/`, `Dockerfile`, `.github/workflows/`, Vercel, Neon, Oracle | those; asks before any cloud change | infrastructure, the Oracle move, the switch-over |

Why these and not others:

- **One backend role**, not domain and db apart: the reader grows with every
  slice alongside the schema, so the two would mostly be messaging each
  other. For a large slice the lead can start two `backend-dev`s on
  different folders.
- **Rules lookup belongs to `qa`**: "does it do what sportbet does?" is the
  parity question.
- **Security is on demand**: the inventory marks three slices sensitive
  (sign-in, admin users and audit, account deletion).
- **No designer yet**: no spec sets a look for the new app. Add one when a
  slice's spec does.

## Which team for which stage

Three to five teammates at a time; each one costs tokens.

| Stage | Team |
| --- | --- |
| Finish #9, then the parity checker (2.3) | backend-dev, qa, architect |
| Slice 4: sign-in, request context, layout, locales | backend-dev, web-dev, security-reviewer, qa, devops |
| Slices 5-13, 15, 16, 18: player pages, admin CRUD, import, mail, static pages | backend-dev, web-dev, qa, architect |
| Slices 14 and 17: admin users and audit, profile and deletion | backend-dev, web-dev, security-reviewer, qa, architect |
| Oracle move, switch-over (Phase 3) | devops, qa, architect |

## Working rules

Every teammate works by these.

- **The workflow does not change.** Brainstorm, spec and plan happen between
  the owner and the lead. The team runs the plan; the lead turns its tasks
  into the shared task list.
- **Each task goes:** developer (test first) -> `qa` (criteria and parity)
  -> `architect` (standards and spec) -> the lead commits.
- **Only the lead commits and pushes.** Work lands on `main`, so one
  committer means teammates never clash in git. A teammate reports the
  files it changed, the commands it ran and their results.
- **Each teammate stays in its own folders.** A change needed elsewhere goes
  to the owning teammate through the lead.
- **Rules are never invented.** A question the sources do not answer goes to
  the owner through the lead.
- **No production data** reaches any teammate. Tests use the synthetic dump
  from the golden scenario; only the owner runs the reader against
  production.
- **Never skip, weaken or delete a failing test** to reach green; a failing
  test is the finding.
- **One `pnpm test:migrate` at a time** across every checkout and worktree:
  the reader's end-to-end tests share Docker labels and `%TEMP%`, so a second
  run trips the first's "leaves nothing behind" checks. Before starting,
  `docker ps --filter label=sportbet-migrate` must list nothing.
- **Owner steps** (Oracle resources, DNS, GitHub secrets, anything costing
  money) come one instruction at a time, and wait for the owner's yes.

## Permissions

Teammates start with the lead's permission mode, and it cannot be set per
teammate when they are started. A teammate's permission prompts appear in
the lead's session, so the owner sees and answers each one there.

"Edits nothing" and "test files only" are instructions in the role, not a
lock: those roles keep Bash to run git and tests. The lead's review of every
change before committing is the check that holds them to it.

## Starting and steering a team

- Start one by asking the lead in plain words, naming the roles, e.g.
  "Start an agent team for #9 with backend-dev, qa and architect."
- **Up/Down** picks a teammate in the agent panel and **Enter** opens its
  transcript to read or message it. **Escape** clears the selection; while
  you are viewing a teammate, it interrupts that teammate's turn. **x**
  stops the selected teammate, and **Ctrl+T** shows the task list.
- `/model` and `/fast` change only the lead; `/effort` changes the teammate
  being viewed.
- To finish, ask the lead to shut the team down. A teammate finishes its
  current request first, and may decline with a reason, which the lead then
  settles.

Known limits: `/resume` and `/rewind` do not bring in-process teammates
back; one team per session; teammates cannot start teammates of their own;
the lead cannot be handed over.
