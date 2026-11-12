# Branches

State on 2026-11-12. `main` already contains everything up to the reveal-secrets work. Tonight's work is 27 commits
in five stacked branches, also available as one branch (`claude/elegant-dirac-1vk5ac`).

## Safe to delete now
These 15 have **no commits of their own**: everything in them is already in `main`. Deleting a branch never deletes commits
that `main` contains.

| Branch | What it was |
|---|---|
| `design/obsidian-pop-tokens`, `design/obsidian-pop-components`, `design/obsidian-pop-polish`, `docs/obsidian-pop-readme` | Obsidian Pop palette (superseded) |
| `design/nitrodrp-style`, `docs/nitrodrp-screens` | full NitroDrp palette (superseded) |
| `design/opus-palette-nitrodrp-bits`, `docs/opus-palette-nitrodrp-bits` | the current style (already in `main`) |
| `feature/approval-queue-ui`, `feature/approval-undo` | approval queue and undo |
| `feature/docker-tailscale`, `fix/dockerfile-shared-dir`, `fix/dockerfile-dev-deps` | Docker and Tailscale setup and its two fixes |
| `feature/reveal-secrets` | `reveal.ts` for sealed secrets |
| `chore/mit-license` | the license |

```bash
git push origin --delete \
  design/obsidian-pop-tokens design/obsidian-pop-components design/obsidian-pop-polish docs/obsidian-pop-readme \
  design/nitrodrp-style docs/nitrodrp-screens design/opus-palette-nitrodrp-bits docs/opus-palette-nitrodrp-bits \
  feature/approval-queue-ui feature/approval-undo feature/docker-tailscale fix/dockerfile-shared-dir \
  fix/dockerfile-dev-deps feature/reveal-secrets chore/mit-license
```

## Keep for now (until you have merged)
| Branch | Commits | Contains |
|---|---|---|
| `main` | | everything up to the previous session |
| `claude/elegant-dirac-1vk5ac` | 27 ahead of `main` | **all five topics below in one branch**: merge this one if you want it all at once |
| `chore/repo-tidy` | 3 | docs index, archived old design docs, `.editorconfig`, `.gitattributes` |
| `design/o-logo-and-colour` | +5 | the car-inspired O logo, icons, new accent colours |
| `feature/iphone-web-app` | +4 | phone layout, More sheet, install tip, launch screens, `mobile-check` |
| `feature/security-hardening` | +9 | rate limits, CSP, host check, injection fixes, crash fix, `test:security`, audit fixes, `SECURITY.md` |
| `feature/portfolio-embed` | +5 | public sample-data demo, Vercel config, `check:demo`, `EMBED.md` |

The five topic branches are **stacked**: each starts where the previous one ends, so they merge in the order above, and
merging the last one merges all of them. They are only worth keeping if you want to review one topic at a time.

## How to merge without losing anything
- **All at once, keeping every signed commit** (recommended):
  ```bash
  git checkout main && git pull
  git merge --ff-only claude/elegant-dirac-1vk5ac
  git push origin main
  ```
  If `main` is protected, open a pull request and choose **Create a merge commit**.
- Do **not** choose "Squash and merge": it collapses the 27 commits into one. Avoid "Rebase and merge" too: GitHub rewrites
  the commits, so your signatures are replaced.

## After you have merged
Delete the rest (all will then be fully contained in `main`):
```bash
git push origin --delete claude/elegant-dirac-1vk5ac chore/repo-tidy design/o-logo-and-colour \
  feature/iphone-web-app feature/security-hardening feature/portfolio-embed
git fetch --prune
```
To see exactly what is safe at any time (these branches have nothing that `main` lacks):
```bash
git fetch --prune && git branch -r --merged origin/main
```
