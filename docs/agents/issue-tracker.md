# Issue tracker

This project tracks work as GitHub issues in **`tomyka/sportbet_new`**, using
the `gh` CLI. `gh` infers the repo from the working directory, so no `--repo`
flag is needed.

This file exists so that skills which expect an issue-tracker workflow (for
example `mp-code-review`, when resolving a `#123` reference in a commit
message) know how to reach it. The rules for when to file and close an issue
are in `CLAUDE.md` > Workflow.

```bash
gh issue view <n>                       # human-readable
gh issue view <n> --json title,body     # for programmatic use
gh issue view <n> --comments            # including the discussion
gh issue list --state all
```

A reference of the form `#123`, `Closes #123` or `Refs #123` in a commit
message points at an issue in this repo. Issues are labelled `size/small`
(a task) or `size/large` (goes through brainstorm -> spec -> plan first).
