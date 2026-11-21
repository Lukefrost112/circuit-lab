# Circuit Lab — Design System & Engineering Aesthetics

## Mode & Visual Direction
- **Mode**: Operate (product UI where clarity, earned familiarity, and task density come first; the interface disappears into circuit engineering).
- **Signature Move**: *Technical Precision* — crisp engineering dot/grid schematic canvas, `tabular-nums` engineering readouts with SI units, live node-voltage and branch-current overlays, and unified IEEE/IEC SVG component geometry.

## Color Tokens (Light & Dark Modes)

### Neutral Surfaces & Hairline Borders
| Role | Light Mode | Dark Mode | CSS Variable |
| :--- | :--- | :--- | :--- |
| Primary Canvas Ground | `#f8fafc` | `#0b0f14` | `--background` / `--canvas-bg` |
| Secondary Rail / Toolbar / Inspector | `#f1f5f9` | `#111827` | `--surface-rail` / `--muted` |
| Elevated Card / Popover / Dialog | `#ffffff` | `#161f2c` | `--card` / `--popover` |
| Hairline Border | `#e2e8f0` | `#1f2937` | `--border` |
| Control Input Border | `#cbd5e1` | `#334155` | `--input` |
| Primary Text | `#0f172a` | `#f1f5f9` | `--foreground` |
| Secondary / Muted Text | `#475569` | `#94a3b8` | `--muted-foreground` |

### Semantic Engineering Accents (Restrained, State-Driven Only)
| Semantic Role | Light Mode | Dark Mode | CSS Variable |
| :--- | :--- | :--- | :--- |
| Primary Actions & Node Voltage (`V`) | `#1d4ed8` | `#60a5fa` | `--primary` / `--voltage` |
| Branch Current (`I`) & Verified Power Balance | `#0f766e` | `#2dd4bf` | `--current` / `--success` |
| Active Selection & Warnings | `#b45309` | `#fbbf24` | `--warning` / `--selection` |
| Solver Error / Short / Floating Node | `#be123c` | `#fb7185` | `--destructive` |

- Inactive controls never carry saturated accent fills.
- All foreground/background pairs maintain >= 4.5:1 contrast for body/labels and >= 3:1 for large headings and schematic graphics.

## Typography
- **UI Sans**: `'Inter'`, system-ui (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`). Fixed `rem` scale (`11px`–`16px` for controls and labels, `18px`–`20px` for modal/empty-state headings).
- **Engineering Mono**: `'JetBrains Mono'`, `'Fira Code'`, ui-monospace (`SFMono-Regular, Menlo, monospace`) with `font-variant-numeric: tabular-nums` enforced on all node voltages, branch currents, component values, coordinates, and matrix rows.

## Elevation, Spacing & Interaction Craft
- **Hairline Hierarchy**: Depth is conveyed through surface value shifts (`--background` vs `--surface-rail` vs `--card`) and `1px` crisp borders; shadows are reserved strictly for floating overlays/dialogs (`0 8px 24px -4px rgb(...)`).
- **Component States**: Every interactive primitive (`Button`, `Input`, `Select`, `Switch`, `Tabs`, `Accordion`, `Dialog`, `Tooltip`) explicitly implements default, hover, `focus-visible` ring (`2px` `--ring`), active, and disabled states in both Light and Dark modes.
- **Overlays**: Tooltips, dialogs, and popovers use `<dialog>` or `position: fixed` so they never clip inside `overflow: hidden` or scrollable inspector rails.
- **Motion**: Fast, state-driven transitions (`150ms` cubic-bezier) with zero decorative page-load animations.
