# petforge

Claude Code plugin for Go + React pet projects.

## Purpose

Adding one entity to a Go + React modular monolith touches the same eight to ten places every time:
OpenAPI spec, migration, SQL queries, domain/app/adapter layers, wiring, API client, UI page and tests.
It is also easy to import across bounded contexts by accident. petforge turns that repeated vertical
slice into a few commands and blocks cross-context imports while Claude edits code.

Status: bootstrap. Commands, skills and hooks are extracted from a real feature log and land in
follow-up PRs.

## Install

```sh
claude plugin marketplace add AndriiOpryshko/petforge
claude plugin install petforge@petforge
```

## Commands

Not yet implemented.

## Skills

Not yet implemented.

## Hooks

Not yet implemented.

## Development

`bash scripts/validate.sh` runs every check (JSON syntax, `claude plugin validate --strict`, manifest
version sync, shell lint, tests). CI runs the same script.

## License

MIT, see [LICENSE](LICENSE).
