# Changelog

All notable changes to Stage Control Plus are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-15

First public release: one desktop organizer that merges
[Stage Control](https://github.com/marcho78/omarchy-stage-control) by marcho78
and [Exposé](https://github.com/kristofferR/omarchy-expose) by kristofferR, so
you get both feature sets in a single icon.

### Features

Combines, unchanged, what each plugin did.

- **From Stage Control** (marcho78): the live stage that follows your fingers,
  the Spaces bar with live desktop thumbnails, desktop add/remove/reorder/rename
  with names that follow their windows, App Exposé (down-swipe), Liquid Glass /
  Frosted / Solid styling, hot corners, the macOS keyboard shortcuts, and the
  settings window.
- **From Exposé** (kristofferR): type-to-search, Quick Look, the Tab
  workspace-scope toggle, the multi-display grid, and the outermost-displays
  hot-corner rule.

### Added

- **Hot-corner linger time** (`hotCornerDelay`, 0–1000 ms) so corners wait for
  a deliberate move instead of firing on a brush past.
- **Choose which displays own the corners** (`hotCornerDisplays`: all, or
  outermost only) instead of it being fixed.
- **Per-session toggles** for workspace scope and display span, with the
  defaults set in the settings (`workspaceScope`, `windowSource`).
- **Quick Look placement** (`quickLookPlacement`: in place or centered).
- **IPC** for scripting: `scopeToggle`, `scopeCurrent`, `scopeAll`, `scope`,
  and `search`.

### Changed

- Plugin id namespaced as `edree0x.stage-control-plus` (was
  `stage-control.plus`). The user-facing CLI stays `omarchy-shell
  stage-control-plus`.

### Credits

- Stage Control by **marcho78** — the stage, the Spaces bar, desktop
  management, the finger-following gesture, App Exposé, Liquid Glass, and the
  settings window.
- Exposé by **kristofferR** — type-to-search, Quick Look, the Tab workspace
  toggle, and the multi-display grid.
- Bird's Eye by **Harel Malka** — Exposé builds on it.

[1.0.0]: https://github.com/edree0x/stage-control.plus/releases/tag/v1.0.0
