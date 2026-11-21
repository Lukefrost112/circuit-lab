# Circuit Lab — Design System & Engineering Aesthetics

## Mode & Visual Direction
- **Mode**: Operate (product UI where clarity, earned familiarity, and task density come first; the interface disappears into circuit engineering).
- **Material Palette**: **Precision Drafting Vellum** (Light Mode — warm mineral paper ground and stone chrome) and **Matte Anodized Carbon** (Dark Mode — true neutral matte carbon with zero blue-slate tint).
- **Signature Move**: *Technical Precision* — crisp SVG dot/major schematic canvas, `tabular-nums` engineering readouts with SI units, live node-voltage and branch-current overlays, and unified IEEE/IEC SVG component geometry.

## Color Tokens (Light & Dark Modes)

### Neutral Surfaces & Hairline Borders
| Role | Light Mode (Vellum) | Dark Mode (Carbon) | CSS Variable |
| :--- | :--- | :--- | :--- |
| Primary Canvas Ground | `#fafaf7` | `#0e0f11` | `--background` |
| Secondary Rail / Toolbar / Inspector | `#f2f1ec` | `#141518` | `--surface-rail` |
| Elevated Card / Popover / Dialog | `#ffffff` | `#1a1c20` | `--card` / `--popover` |
| Secondary Control Surface | `#eae8e1` | `#212329` | `--secondary` |
| Muted Surface | `#eae8e1` | `#1e2025` | `--muted` |
| Interactive Hover / Accent Surface | `#e5e3db` | `#252830` | `--accent` |
| Hairline Border | `#e2e0d8` | `#26282e` | `--border` |
| Control Input Border | `#ccc9be` | `#343841` | `--input` |
| Primary Ink / Text | `#161614` | `#edeef0` | `--foreground` |
| Secondary / Muted Text | `#5c5a52` (`>= 6.3:1`) | `#8e939e` (`>= 5.8:1`) | `--muted-foreground` |
| Schematic Minor Dot Grid | `#cfcdc3` | `#2a2d35` | `--canvas-dot` |
| Schematic Major Grid Rule | `#ebe9e1` | `#17191e` | `--canvas-major` |

### Semantic Engineering Accents (Restrained, State-Driven Only)
| Semantic Role | Light Mode | Dark Mode | CSS Variable |
| :--- | :--- | :--- | :--- |
| Primary Actions, Focus Ring & Node Voltage (`V`) | `#1b4fd8` | `#5b9aff` | `--primary` / `--ring` / `--voltage` |
| Branch Current (`I`) & Verified Power Balance | `#0d7a6c` | `#2dd4bf` | `--current` / `--success` |
| Active Selection & Warnings | `#b45309` | `#f59e0b` | `--warning` |
| Solver Error / Short / Floating Node | `#be123c` | `#fb7185` | `--destructive` |

- Inactive controls never carry saturated accent fills.
- All foreground/background pairs maintain `>= 4.5:1` contrast for body/labels (muted text targets `>= 5.8:1`–`6.3:1`) and `>= 3:1` for large headings and schematic graphics.

## Typography (Self-Hosted & Offline-Bundled)
- **UI Sans**: `'Public Sans Variable'` (`@fontsource-variable/public-sans`), imported in `src/routes/+layout.svelte` so static GitHub Pages deployments render identically offline without external font requests. Fixed `rem` scale (`10.5px`–`14px` for controls, badges, and dense inspector tables; `16px`–`20px` for modal/empty-state headings with `text-wrap: balance` on `h1`–`h3`).
- **Engineering Mono**: `'JetBrains Mono Variable'` (`@fontsource-variable/jetbrains-mono`) via `.font-engineering`, enforcing `font-variant-numeric: tabular-nums` on all node voltages, branch currents, component values, coordinates, and MNA matrix rows.

## Architectural Chrome, Elevation & Layout Rules
- **Sharp Instrument Geometry**: Base corner radius is `--radius: 0.25rem` (`4px`), badges use crisp `3px` (`rounded-[3px]`) corners, and buttons/cards use flat architectural fills with `1px` hairline borders rather than drop shadows.
- **Hairline Hierarchy & No Nested Cards**: Depth is conveyed through surface value shifts (`--background` vs `--surface-rail` vs `--card`) and `1px` crisp borders. Inside side rails, inspectors, and analysis drawers, avoid stacking boxed cards inside cards — use `Accordion variant="flush"`, `Table variant="flush"`, and `Tabs variant="underline"` separated by clean hairline dividers.
- **Docked Status Chrome (No Floating Canvas Pill Clutter)**: Canvas viewport controls, grid/zoom telemetry, and solver status live in clean docked bars or integrated rail headers with `1px` borders rather than detached floating pills obscuring the schematic.
- **Strict Shadow Discipline**: Shadows are reserved exclusively for floating overlays, popovers, sheets, and `<dialog>` modals (`0 8px 24px -4px rgb(...)`) — never on inline buttons, tabs, badges, or static cards.
- **Component States**: Every interactive primitive (`Button`, `Input`, `Select`, `Switch`, `Tabs`, `Accordion`, `Dialog`, `Tooltip`) explicitly implements default, hover, `focus-visible` ring (`2px` `--ring`), active, and disabled states in both Light and Dark modes.
- **Overlays**: Tooltips, dialogs, and popovers use `<dialog>` or `position: fixed` so they never clip inside `overflow: hidden` or scrollable inspector rails.
- **Motion**: Fast, state-driven transitions (`150ms`) with zero decorative page-load animations.

## Icon & Schematic Geometry Discipline
- **UI Icons**: Use crisp `lucide-svelte` stroke icons (`size-3.5` / `size-4`) sized proportionally to adjacent labels. Do not wrap routine controls in decorative tinted icon circles or oversized icon cards.
- **Schematic Symbols & Grid**: Schematic symbols default to unified **IEEE** geometry (zigzag resistors) with an **IEC** toggle (rectangular resistors). The schematic dot/major grid is drawn strictly inside the interactive SVG viewport using `--canvas-dot` and `--canvas-major` patterns — never as a decorative CSS background grid on chrome or non-canvas surfaces.
