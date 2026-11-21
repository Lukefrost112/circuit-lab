<script lang="ts">
	import katex from 'katex';
	import { mode, toggleMode } from 'mode-watcher';
	import {
		BookOpen,
		Cpu,
		FileCode2,
		Minus,
		Moon,
		PanelLeftClose,
		PanelLeftOpen,
		PanelRightClose,
		PanelRightOpen,
		Plus,
		RotateCcw,
		Scan,
		Settings,
		Sparkles,
		Sun
	} from 'lucide-svelte';
	import {
		Accordion,
		AccordionItem,
		Badge,
		Button,
		Dialog,
		Input,
		Label,
		Select,
		Separator,
		Switch,
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow,
		Tabs,
		TabsContent,
		TabsList,
		TabsTrigger,
		Tooltip
	} from '$lib/components/ui';
	import { cn } from '$lib/utils';

	type AnalysisMode = 'dc' | 'ac';
	type PaletteCategory = 'sources' | 'passives' | 'connections';

	interface PaletteItem {
		id: string;
		name: string;
		shortcut: string;
		category: PaletteCategory;
		symbol: 'vdc' | 'vac' | 'idc' | 'resistor' | 'capacitor' | 'inductor' | 'ground' | 'wire' | 'probe';
	}

	const PALETTE_ITEMS: PaletteItem[] = [
		{ id: 'vdc', name: 'DC Voltage Source', shortcut: 'V', category: 'sources', symbol: 'vdc' },
		{ id: 'vac', name: 'AC Voltage Source', shortcut: 'A', category: 'sources', symbol: 'vac' },
		{ id: 'idc', name: 'Current Source', shortcut: 'I', category: 'sources', symbol: 'idc' },
		{ id: 'resistor', name: 'Resistor', shortcut: 'R', category: 'passives', symbol: 'resistor' },
		{ id: 'capacitor', name: 'Capacitor', shortcut: 'C', category: 'passives', symbol: 'capacitor' },
		{ id: 'inductor', name: 'Inductor', shortcut: 'L', category: 'passives', symbol: 'inductor' },
		{ id: 'wire', name: 'Orthogonal Wire', shortcut: 'W', category: 'connections', symbol: 'wire' },
		{ id: 'ground', name: 'Ground Reference', shortcut: 'G', category: 'connections', symbol: 'ground' },
		{ id: 'probe', name: 'Node Voltage Probe', shortcut: 'P', category: 'connections', symbol: 'probe' }
	];

	let analysisMode = $state<AnalysisMode>('dc');
	let acFrequencyHz = $state('1000');
	let activeTool = $state<string>('wire');
	let paletteFilter = $state('');
	let openGroups = $state<string[]>(['sources', 'passives', 'connections']);
	let inspectorTab = $state('inspector');
	let leftRailOpen = $state(true);
	let rightRailOpen = $state(true);
	let zoomPercent = $state(100);
	let snapToGrid = $state(true);
	let showOverlayLabels = $state(true);
	let symbolStandard = $state('ieee');

	let activeModal = $state<'presets' | 'import' | 'ai-import' | 'settings' | null>(null);

	const filteredPalette = $derived.by(() => {
		const q = paletteFilter.trim().toLowerCase();
		if (!q) return PALETTE_ITEMS;
		return PALETTE_ITEMS.filter(
			(item) =>
				item.name.toLowerCase().includes(q) || item.shortcut.toLowerCase().includes(q)
		);
	});

	const sourcesList = $derived(filteredPalette.filter((i) => i.category === 'sources'));
	const passivesList = $derived(filteredPalette.filter((i) => i.category === 'passives'));
	const connectionsList = $derived(filteredPalette.filter((i) => i.category === 'connections'));

	const mnaEquationHtml = $derived.by(() => {
		const tex =
			analysisMode === 'dc'
				? String.raw`\begin{bmatrix} \mathbf{G} & \mathbf{B} \\ \mathbf{C} & \mathbf{D} \end{bmatrix} \begin{bmatrix} \mathbf{v} \\ \mathbf{i}_s \end{bmatrix} = \begin{bmatrix} \mathbf{i} \\ \mathbf{e} \end{bmatrix}`
				: String.raw`\begin{gathered} \begin{bmatrix} \mathbf{Y}(j\omega) & \mathbf{B} \\ \mathbf{C} & \mathbf{D} \end{bmatrix} \begin{bmatrix} \mathbf{V} \\ \mathbf{I}_s \end{bmatrix} = \begin{bmatrix} \mathbf{I} \\ \mathbf{E} \end{bmatrix} \\[4pt] \omega = 2\pi f \end{gathered}`;
		return katex.renderToString(tex, { displayMode: true, throwOnError: false });
	});

	const isDark = $derived(mode.current === 'dark');

	function adjustZoom(delta: number) {
		zoomPercent = Math.min(200, Math.max(50, zoomPercent + delta));
	}
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
	<!-- Top Toolbar -->
	<header class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface-rail px-3">
		<!-- Left: Brand & Rail Toggle -->
		<div class="flex min-w-0 items-center gap-2">
			<Tooltip content={leftRailOpen ? 'Collapse component palette' : 'Expand component palette'} side="bottom">
				<Button
					variant="ghost"
					size="icon"
					aria-label={leftRailOpen ? 'Collapse component palette' : 'Expand component palette'}
					onclick={() => (leftRailOpen = !leftRailOpen)}
				>
					{#if leftRailOpen}
						<PanelLeftClose />
					{:else}
						<PanelLeftOpen />
					{/if}
				</Button>
			</Tooltip>

			<div class="flex items-center gap-2">
				<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
					<Cpu class="size-4" />
				</div>
				<span class="truncate text-sm font-semibold tracking-tight text-foreground">
					Circuit Lab
				</span>
			</div>

			<Separator orientation="vertical" class="mx-1 hidden h-5 sm:block" />

			<!-- DC / AC Segmented Mode Control -->
			<div
				role="radiogroup"
				aria-label="Analysis mode"
				class="inline-flex h-8 items-center rounded-md border border-border bg-background p-0.5"
			>
				<button
					type="button"
					role="radio"
					aria-checked={analysisMode === 'dc'}
					onclick={() => (analysisMode = 'dc')}
					class={cn(
						'cursor-pointer rounded-sm px-2.5 py-1 text-xs font-medium transition-colors duration-150',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						analysisMode === 'dc'
							? 'bg-primary text-primary-foreground shadow-2xs'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					DC
				</button>
				<button
					type="button"
					role="radio"
					aria-checked={analysisMode === 'ac'}
					onclick={() => (analysisMode = 'ac')}
					class={cn(
						'cursor-pointer rounded-sm px-2.5 py-1 text-xs font-medium transition-colors duration-150',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						analysisMode === 'ac'
							? 'bg-primary text-primary-foreground shadow-2xs'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					AC
				</button>
			</div>

			{#if analysisMode === 'ac'}
				<Badge variant="voltage" class="hidden md:inline-flex">
					{acFrequencyHz} Hz
				</Badge>
			{:else}
				<Badge variant="outline" class="hidden font-engineering md:inline-flex">
					Steady-State DC
				</Badge>
			{/if}
		</div>

		<!-- Right: Workbench Actions & Theme Toggle -->
		<div class="flex shrink-0 items-center gap-1.5">
			<Button variant="outline" size="sm" onclick={() => (activeModal = 'presets')}>
				<BookOpen />
				<span>Presets</span>
			</Button>
			<Button variant="outline" size="sm" onclick={() => (activeModal = 'import')}>
				<FileCode2 />
				<span>Import</span>
			</Button>
			<Button variant="secondary" size="sm" onclick={() => (activeModal = 'ai-import')}>
				<Sparkles />
				<span class="hidden sm:inline">AI Import</span>
			</Button>

			<Separator orientation="vertical" class="mx-0.5 h-5" />

			<Tooltip content="Workbench settings" side="bottom">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Workbench settings"
					onclick={() => (activeModal = 'settings')}
				>
					<Settings />
				</Button>
			</Tooltip>

			<Tooltip content={isDark ? 'Switch to light mode' : 'Switch to dark mode'} side="bottom">
				<Button
					variant="ghost"
					size="icon"
					aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
					onclick={toggleMode}
				>
					{#if isDark}
						<Sun />
					{:else}
						<Moon />
					{/if}
				</Button>
			</Tooltip>

			<Tooltip content={rightRailOpen ? 'Collapse inspector' : 'Expand inspector'} side="bottom">
				<Button
					variant="ghost"
					size="icon"
					aria-label={rightRailOpen ? 'Collapse inspector' : 'Expand inspector'}
					onclick={() => (rightRailOpen = !rightRailOpen)}
				>
					{#if rightRailOpen}
						<PanelRightClose />
					{:else}
						<PanelRightOpen />
					{/if}
				</Button>
			</Tooltip>
		</div>
	</header>

	<!-- Main 3-Pane Workbench -->
	<div class="flex h-[calc(100vh-3rem)] min-h-0 w-full min-w-0 overflow-hidden">
		<!-- Left Component Palette Rail -->
		{#if leftRailOpen}
			<aside
				aria-label="Component palette"
				class="flex w-60 shrink-0 flex-col border-r border-border bg-surface-rail"
			>
				<div class="flex flex-col gap-2 border-b border-border p-3">
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold tracking-tight text-foreground">
							Component Palette
						</span>
						<Badge variant="outline" class="font-engineering">
							{PALETTE_ITEMS.length}
						</Badge>
					</div>
					<Input
						type="search"
						placeholder="Filter parts or key..."
						bind:value={paletteFilter}
						aria-label="Filter components"
					/>
				</div>

				<div class="flex-1 overflow-y-auto p-2">
					<Accordion type="multiple" bind:value={openGroups}>
						{#if sourcesList.length > 0}
							<AccordionItem value="sources" title="Sources">
								<div class="flex flex-col gap-1">
									{#each sourcesList as item (item.id)}
										<button
											type="button"
											onclick={() => (activeTool = item.id)}
											class={cn(
												'flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border px-1.5 py-1.5 text-left text-xs transition-colors duration-150',
												'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
												activeTool === item.id
													? 'border-warning/60 bg-warning/10 text-foreground font-medium'
													: 'border-transparent text-foreground hover:bg-accent/70'
											)}
										>
											<span class="flex min-w-0 items-center gap-1.5">
												<svg
													viewBox="0 0 28 20"
													class="h-4 w-6 shrink-0 stroke-current"
													fill="none"
													stroke-width="1.6"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													{#if item.symbol === 'vdc'}
														<line x1="2" y1="10" x2="7" y2="10" />
														<circle cx="14" cy="10" r="6.5" />
														<line x1="21" y1="10" x2="26" y2="10" />
														<line x1="11.5" y1="10" x2="11.5" y2="10" />
														<path d="M10.5 7.5v3M9 9h3M15.5 9h2" />
													{:else if item.symbol === 'vac'}
														<line x1="2" y1="10" x2="7" y2="10" />
														<circle cx="14" cy="10" r="6.5" />
														<line x1="21" y1="10" x2="26" y2="10" />
														<path d="M10.5 10c1-2.5 2.5-2.5 3.5 0s2.5 2.5 3.5 0" />
													{:else}
														<line x1="2" y1="10" x2="7" y2="10" />
														<circle cx="14" cy="10" r="6.5" />
														<line x1="21" y1="10" x2="26" y2="10" />
														<path d="M10.5 10h6M14.5 7.5 17 10l-2.5 2.5" />
													{/if}
												</svg>
												<span class="truncate">{item.name}</span>
											</span>
											<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
												{item.shortcut}
											</kbd>
										</button>
									{/each}
								</div>
							</AccordionItem>
						{/if}

						{#if passivesList.length > 0}
							<AccordionItem value="passives" title="Passives">
								<div class="flex flex-col gap-1">
									{#each passivesList as item (item.id)}
										<button
											type="button"
											onclick={() => (activeTool = item.id)}
											class={cn(
												'flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border px-1.5 py-1.5 text-left text-xs transition-colors duration-150',
												'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
												activeTool === item.id
													? 'border-warning/60 bg-warning/10 text-foreground font-medium'
													: 'border-transparent text-foreground hover:bg-accent/70'
											)}
										>
											<span class="flex min-w-0 items-center gap-1.5">
												<svg
													viewBox="0 0 28 20"
													class="h-4 w-6 shrink-0 stroke-current"
													fill="none"
													stroke-width="1.6"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													{#if item.symbol === 'resistor'}
														<path d="M2 10h4l2-4 3 8 3-8 3 8 3-8 2 4h4" />
													{:else if item.symbol === 'capacitor'}
														<line x1="2" y1="10" x2="12" y2="10" />
														<line x1="12" y1="4" x2="12" y2="16" />
														<line x1="16" y1="4" x2="16" y2="16" />
														<line x1="16" y1="10" x2="26" y2="10" />
													{:else}
														<path d="M2 12h4c0-4 4-4 4 0 0-4 4-4 4 0 0-4 4-4 4 0 0-4 4-4 4 0h4" />
													{/if}
												</svg>
												<span class="truncate">{item.name}</span>
											</span>
											<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
												{item.shortcut}
											</kbd>
										</button>
									{/each}
								</div>
							</AccordionItem>
						{/if}

						{#if connectionsList.length > 0}
							<AccordionItem value="connections" title="Wiring & Probes">
								<div class="flex flex-col gap-1">
									{#each connectionsList as item (item.id)}
										<button
											type="button"
											onclick={() => (activeTool = item.id)}
											class={cn(
												'flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border px-1.5 py-1.5 text-left text-xs transition-colors duration-150',
												'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
												activeTool === item.id
													? 'border-warning/60 bg-warning/10 text-foreground font-medium'
													: 'border-transparent text-foreground hover:bg-accent/70'
											)}
										>
											<span class="flex min-w-0 items-center gap-1.5">
												<svg
													viewBox="0 0 28 20"
													class="h-4 w-6 shrink-0 stroke-current"
													fill="none"
													stroke-width="1.6"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													{#if item.symbol === 'wire'}
														<path d="M3 15h11V5h11" />
														<circle cx="3" cy="15" r="1.5" fill="currentColor" />
														<circle cx="25" cy="5" r="1.5" fill="currentColor" />
													{:else if item.symbol === 'ground'}
														<line x1="14" y1="3" x2="14" y2="10" />
														<line x1="7" y1="10" x2="21" y2="10" />
														<line x1="9.5" y1="13.5" x2="18.5" y2="13.5" />
														<line x1="12" y1="17" x2="16" y2="17" />
													{:else}
														<circle cx="14" cy="9" r="5" />
														<path d="M14 14v4M12 9l2-2 2 2" />
													{/if}
												</svg>
												<span class="truncate">{item.name}</span>
											</span>
											<kbd class="rounded border border-border bg-background px-1 py-0.5 font-engineering text-[10px] text-muted-foreground">
												{item.shortcut}
											</kbd>
										</button>
									{/each}
								</div>
							</AccordionItem>
						{/if}
					</Accordion>
				</div>

				<div class="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
					Active tool:
					<span class="font-medium text-foreground">
						{PALETTE_ITEMS.find((i) => i.id === activeTool)?.name ?? 'Select'}
					</span>
				</div>
			</aside>
		{/if}

		<!-- Center Schematic Canvas Viewport -->
		<main class="engineering-grid relative flex min-w-0 flex-1 flex-col overflow-hidden">
			<!-- Top-left Canvas Telemetry Strip -->
			<div class="pointer-events-none flex items-center justify-between p-3">
				<div class="pointer-events-auto inline-flex items-center gap-2 rounded-md border border-border bg-card/95 px-2.5 py-1 text-[11px] shadow-2xs">
					<span class="font-engineering text-muted-foreground">
						Grid: 20 px
					</span>
					<Separator orientation="vertical" class="h-3" />
					<span class="font-engineering text-foreground">
						Snap: {snapToGrid ? 'ON' : 'OFF'}
					</span>
					<Separator orientation="vertical" class="h-3" />
					<span class="font-engineering text-voltage">
						0 Nodes
					</span>
				</div>

				<div class="pointer-events-auto hidden items-center gap-1.5 rounded-md border border-border bg-card/95 px-2.5 py-1 text-[11px] shadow-2xs sm:inline-flex">
					<span class="h-2 w-2 rounded-full bg-branch-current"></span>
					<span class="text-muted-foreground">Solver idle</span>
				</div>
			</div>

			<!-- Onboarding Empty State -->
			<div class="flex flex-1 items-center justify-center p-4">
				<div class="w-full max-w-md rounded-lg border border-border bg-card/95 p-6 shadow-sm">
					<div class="mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-rail text-primary">
						<svg
							viewBox="0 0 32 32"
							class="size-6 stroke-current"
							fill="none"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M4 16h5l2-5 3 10 3-10 3 10 2-5h6" />
							<circle cx="4" cy="16" r="1.5" fill="currentColor" />
							<circle cx="28" cy="16" r="1.5" fill="currentColor" />
						</svg>
					</div>

					<h1 class="text-base font-semibold tracking-tight text-foreground">
						Place a component or load a preset to begin
					</h1>
					<p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
						Select a source, passive element, or wire tool from the palette to capture your
						schematic, or open a verified reference circuit to inspect live node voltages and
						branch currents.
					</p>

					<div class="mt-4 flex flex-wrap items-center gap-2">
						<Button variant="default" size="sm" onclick={() => (activeModal = 'presets')}>
							<BookOpen />
							<span>Browse Presets</span>
						</Button>
						<Button variant="outline" size="sm" onclick={() => (activeModal = 'import')}>
							<FileCode2 />
							<span>Import Netlist</span>
						</Button>
						<Button variant="ghost" size="sm" onclick={() => (activeModal = 'ai-import')}>
							<Sparkles />
							<span>AI Import</span>
						</Button>
					</div>
				</div>
			</div>

			<!-- Bottom-left Canvas Viewport Controls -->
			<div class="pointer-events-none flex items-center justify-between p-3">
				<div class="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-border bg-card/95 p-1 shadow-2xs">
					<Tooltip content="Zoom out" side="top">
						<Button
							variant="ghost"
							size="icon"
							class="h-6 w-6"
							aria-label="Zoom out"
							onclick={() => adjustZoom(-10)}
						>
							<Minus class="size-3.5" />
						</Button>
					</Tooltip>
					<span class="min-w-11 text-center font-engineering text-[11px] text-foreground">
						{zoomPercent}%
					</span>
					<Tooltip content="Zoom in" side="top">
						<Button
							variant="ghost"
							size="icon"
							class="h-6 w-6"
							aria-label="Zoom in"
							onclick={() => adjustZoom(10)}
						>
							<Plus class="size-3.5" />
						</Button>
					</Tooltip>
					<Separator orientation="vertical" class="mx-0.5 h-4" />
					<Tooltip content="Reset viewport" side="top">
						<Button
							variant="ghost"
							size="icon"
							class="h-6 w-6"
							aria-label="Reset zoom"
							onclick={() => (zoomPercent = 100)}
						>
							<RotateCcw class="size-3.5" />
						</Button>
					</Tooltip>
					<Tooltip content="Fit schematic to view" side="top">
						<Button variant="ghost" size="icon" class="h-6 w-6" aria-label="Fit to view">
							<Scan class="size-3.5" />
						</Button>
					</Tooltip>
				</div>
			</div>
		</main>

		<!-- Right Inspector & Results Panel -->
		{#if rightRailOpen}
			<aside
				aria-label="Inspector and analysis results"
				class="flex w-76 shrink-0 flex-col border-l border-border bg-surface-rail lg:w-80 xl:w-88"
			>
				<Tabs bind:value={inspectorTab} class="flex min-h-0 flex-1 flex-col">
					<div class="border-b border-border px-3 py-2">
						<TabsList class="grid w-full grid-cols-3">
							<TabsTrigger value="inspector">Inspector</TabsTrigger>
							<TabsTrigger value="results">Results</TabsTrigger>
							<TabsTrigger value="equations">Equations</TabsTrigger>
						</TabsList>
					</div>

					<div class="flex-1 overflow-y-auto p-3">
						<TabsContent value="inspector" class="flex flex-col gap-4">
							<div class="rounded-md border border-border bg-card p-3">
								<h2 class="text-xs font-semibold text-foreground">No Element Selected</h2>
								<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
									Click any component or node on the schematic canvas to edit resistance,
									capacitance, inductance, or source magnitude and phase.
								</p>
							</div>

							<div class="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
								<h3 class="text-xs font-semibold text-foreground">Simulation Parameters</h3>

								{#if analysisMode === 'ac'}
									<div class="flex flex-col gap-1.5">
										<Label for="ac-frequency">Drive Frequency (Hz)</Label>
										<Input
											id="ac-frequency"
											type="number"
											tabular
											bind:value={acFrequencyHz}
											min="0.001"
											step="any"
										/>
									</div>
								{/if}

								<div class="flex flex-col gap-1.5">
									<Label for="symbol-standard">Schematic Standard</Label>
									<Select
										id="symbol-standard"
										bind:value={symbolStandard}
										options={[
											{ value: 'ieee', label: 'IEEE / ANSI (Zigzag Resistor)' },
											{ value: 'iec', label: 'IEC 60617 (Rectangular Resistor)' }
										]}
									/>
								</div>

								<Separator />

								<div class="flex items-center justify-between gap-2">
									<div class="flex flex-col gap-0.5">
										<Label for="snap-grid-switch">Grid Snapping</Label>
										<span class="text-[11px] text-muted-foreground">20 px pitch alignment</span>
									</div>
									<Switch id="snap-grid-switch" bind:checked={snapToGrid} />
								</div>

								<div class="flex items-center justify-between gap-2">
									<div class="flex flex-col gap-0.5">
										<Label for="overlay-labels-switch">Live V / I Overlays</Label>
										<span class="text-[11px] text-muted-foreground">Show node pills on canvas</span>
									</div>
									<Switch id="overlay-labels-switch" bind:checked={showOverlayLabels} />
								</div>
							</div>
						</TabsContent>

						<TabsContent value="results" class="flex flex-col gap-3">
							<div class="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
								<span class="text-xs font-medium text-foreground">Power Balance</span>
								<Badge variant="success">Verified Ready</Badge>
							</div>

							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Node</TableHead>
										<TableHead class="text-right">Voltage</TableHead>
										<TableHead class="text-right">Phase</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<TableRow>
										<TableCell class="font-engineering text-muted-foreground">GND (0)</TableCell>
										<TableCell tabular class="text-right text-voltage">0.000 V</TableCell>
										<TableCell tabular class="text-right text-muted-foreground">0.0°</TableCell>
									</TableRow>
								</TableBody>
							</Table>

							<p class="text-[11px] leading-relaxed text-muted-foreground">
								Add components and connect a ground reference node to compute node voltages,
								branch currents, and element power dissipation.
							</p>
						</TabsContent>

						<TabsContent value="equations" class="flex flex-col gap-3">
							<div class="rounded-md border border-border bg-card p-3">
								<div class="mb-2 flex items-center justify-between">
									<h2 class="text-xs font-semibold text-foreground">
										Modified Nodal Analysis ({analysisMode.toUpperCase()})
									</h2>
									<Badge variant="outline" class="font-engineering">MNA</Badge>
								</div>
								<div class="overflow-x-auto py-1 text-xs text-foreground">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html mnaEquationHtml}
								</div>
								<p class="mt-2 text-[11px] leading-relaxed text-muted-foreground">
									Step-by-step nodal KCL stamps and numeric matrix solutions appear here once
									a solvable schematic is present.
								</p>
							</div>
						</TabsContent>
					</div>
				</Tabs>
			</aside>
		{/if}
	</div>
</div>

<!-- Workbench Modals (Scaffolded for subsequent milestones) -->
<Dialog
	open={activeModal === 'presets'}
	onOpenChange={(isOpen) => {
		if (!isOpen) activeModal = null;
	}}
	title="Circuit Presets"
	description="Curated DC and AC teaching schematics will load from this library in Milestone 3."
>
	<div class="flex flex-col gap-2 text-xs text-muted-foreground">
		<div class="rounded-md border border-border bg-surface-rail/60 p-3">
			<div class="font-medium text-foreground">Resistive Voltage Divider</div>
			<div class="mt-0.5">12 V DC source with 1 kΩ / 2 kΩ series divider and node probe.</div>
		</div>
		<div class="rounded-md border border-border bg-surface-rail/60 p-3">
			<div class="font-medium text-foreground">Series RLC Resonance</div>
			<div class="mt-0.5">AC voltage source driving R, L, and C phasor impedance network.</div>
		</div>
	</div>
	{#snippet footer()}
		<Button variant="outline" size="sm" onclick={() => (activeModal = null)}>Close</Button>
	{/snippet}
</Dialog>

<Dialog
	open={activeModal === 'import'}
	onOpenChange={(isOpen) => {
		if (!isOpen) activeModal = null;
	}}
	title="Import Circuit Netlist / JSON"
	description="Schematic JSON and SPICE-like netlist parsing will be wired in Milestone 3."
>
	<p class="text-xs leading-relaxed text-muted-foreground">
		Paste or upload a Circuit Lab JSON workspace or netlist definition to populate the canvas and
		solve immediately.
	</p>
	{#snippet footer()}
		<Button variant="outline" size="sm" onclick={() => (activeModal = null)}>Close</Button>
	{/snippet}
</Dialog>

<Dialog
	open={activeModal === 'ai-import'}
	onOpenChange={(isOpen) => {
		if (!isOpen) activeModal = null;
	}}
	title="AI Circuit Import"
	description="Extract schematics from circuit diagrams or text descriptions in Milestone 4."
>
	<p class="text-xs leading-relaxed text-muted-foreground">
		Provide your own API key in Settings to convert circuit textbook problems or schematic images
		into editable Circuit Lab topologies.
	</p>
	{#snippet footer()}
		<Button variant="outline" size="sm" onclick={() => (activeModal = null)}>Close</Button>
	{/snippet}
</Dialog>

<Dialog
	open={activeModal === 'settings'}
	onOpenChange={(isOpen) => {
		if (!isOpen) activeModal = null;
	}}
	title="Workbench Settings"
	description="Configure schematic conventions, display precision, and theme preferences."
>
	<div class="flex flex-col gap-3">
		<div class="flex items-center justify-between">
			<Label for="settings-dark-theme">Dark Theme</Label>
			<Switch id="settings-dark-theme" checked={isDark} onCheckedChange={() => toggleMode()} />
		</div>
		<div class="flex items-center justify-between">
			<Label for="settings-snap-grid">Snap Components to Grid</Label>
			<Switch id="settings-snap-grid" bind:checked={snapToGrid} />
		</div>
		<div class="flex items-center justify-between">
			<Label for="settings-vi-overlays">Canvas V / I Overlays</Label>
			<Switch id="settings-vi-overlays" bind:checked={showOverlayLabels} />
		</div>
	</div>
	{#snippet footer()}
		<Button variant="default" size="sm" onclick={() => (activeModal = null)}>Done</Button>
	{/snippet}
</Dialog>
