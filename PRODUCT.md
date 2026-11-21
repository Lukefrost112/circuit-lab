# Circuit Lab — Product Specification

## Purpose & Target User
**Circuit Lab** is a browser-based, formal electrical engineering workbench for interactive DC and steady-state AC schematic capture, nodal analysis (MNA), and step-by-step circuit verification. Designed for electrical engineering students, instructors, and practicing engineers who need immediate, inspectable circuit solutions without heavyweight desktop SPICE setup.

## Core Capabilities
1. **Schematic Capture Canvas**: Interactive grid-aligned schematic editor supporting orthogonal wiring, component placement, rotation, deletion, undo/redo, pan/zoom, and unified IEEE/IEC SVG component symbols (resistors, capacitors, inductors, independent/dependent DC & AC voltage/current sources, ground, probes, ideal op-amps/switches as supported).
2. **DC & Steady-State AC Nodal Analysis**: Exact Modified Nodal Analysis (MNA) in the browser using real/complex arithmetic, reporting node voltages ($V_n$), branch currents ($I_b$), element power dissipation/generation ($P$), and KCL/KVL/Tellegen power-balance verification.
3. **Live On-Canvas Engineering Overlays**: Real-time node voltage pills and branch current directional indicators rendered directly alongside schematic nodes and branches, plus interactive probe inspection.
4. **Step-by-Step Mathematical Derivation**: KaTeX-rendered MNA matrix formulation, nodal equations, and symbolic/numeric solution steps in the Inspector & Results rail.
5. **Presets, Netlist/JSON Import & AI Circuit Import**: Curated teaching circuits (voltage dividers, Wheatstone bridges, RLC resonance, Thevenin equivalents), JSON/netlist import-export, and optional AI-assisted schematic extraction.
6. **Static SPA Deployment**: 100% client-side execution with `localStorage` persistence, deployed statically to GitHub Pages.

## Workspace Layout (Operate Mode)
- **Top Toolbar (`48px`)**: Brand identity, `DC` / `AC` analysis mode segmented control, Preset / Import / AI Import / Settings triggers, and Light/Dark theme toggle.
- **Left Rail (`224px`, collapsible)**: Component Palette grouped by Sources, Passives, and Connections/Probes with keyboard shortcuts and drag/click-to-place affordances.
- **Center Viewport (`flex-1`)**: Infinite-feel crisp engineering grid schematic canvas with zoom/fit controls, live voltage/current overlays, and an actionable onboarding empty state when the schematic is blank.
- **Right Rail (`352px`, collapsible)**: Tabbed Inspector & Results panel — Selected Component properties (tabular numeric inputs + engineering unit prefixes), Node/Branch Results table, Power Balance verification, and KaTeX MNA Equations.
