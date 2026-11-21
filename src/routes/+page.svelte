<script lang="ts">
	import { mode, toggleMode } from 'mode-watcher';
	import {
		BarChart3,
		BookOpen,
		CircuitBoard,
		FileCode2,
		Moon,
		MoreVertical,
		PanelLeftClose,
		PanelLeftOpen,
		PanelRightClose,
		PanelRightOpen,
		ScanLine,
		Settings,
		SlidersHorizontal,
		Sun
	} from 'lucide-svelte';
	import {
		ImportFromAIDialog,
		JsonDialog,
		PresetsDialog,
		SettingsDialog
	} from '$lib/components/dialogs';
	import {
		ComponentPalette,
		PropertyInspector,
		SchematicCanvas
	} from '$lib/components/editor';
	import { ResultsPanel, formatFrequency } from '$lib/components/results';
	import {
		Badge,
		Button,
		Input,
		Separator,
		Sheet,
		Tabs,
		TabsContent,
		TabsList,
		TabsTrigger,
		Tooltip
	} from '$lib/components/ui';
	import type { CircuitPreset } from '$lib/data/presets';
	import type { CircuitDocument } from '$lib/engine';
	import { circuit } from '$lib/stores/circuit.svelte';
	import { cn } from '$lib/utils';

	let leftRailOpen = $state(true);
	let rightRailOpen = $state(true);
	let rightTab = $state<'results' | 'inspector'>('results');
	let mobileTab = $state<'canvas' | 'results' | 'inspector'>('canvas');
	let paletteSheetOpen = $state(false);
	let mobileMenuOpen = $state(false);
	let freqPopoverOpen = $state(false);

	let presetsOpen = $state(false);
	let jsonOpen = $state(false);
	let aiOpen = $state(false);
	let settingsOpen = $state(false);

	let freqDraft = $state(String(circuit.document.frequencyHz));

	$effect(() => {
		freqDraft = String(circuit.document.frequencyHz);
	});

	$effect(() => {
		if (circuit.document.mode !== 'ac') {
			freqPopoverOpen = false;
		}
	});

	const isDark = $derived(mode.current === 'dark');
	const isEmpty = $derived(circuit.document.components.length === 0);
	const errorCount = $derived(
		circuit.solution.mna.diagnostics.filter((d) => d.severity === 'error').length
	);
	const isVerified = $derived(
		circuit.solution.mna.valid &&
			circuit.solution.allVerified &&
			circuit.solution.mna.powerBalance.balanced
	);

	const statusInfo = $derived.by(() => {
		if (isEmpty) {
			return {
				dotClass: 'bg-muted-foreground/50',
				label: 'Circuit is empty'
			};
		}
		if (errorCount > 0 || !circuit.solution.mna.valid) {
			return {
				dotClass: 'bg-destructive',
				label:
					errorCount > 0
						? `${errorCount} ${errorCount === 1 ? 'error' : 'errors'} in circuit`
						: 'Circuit invalid'
			};
		}
		if (isVerified) {
			return {
				dotClass: 'bg-branch-current',
				label: 'Verified · Power balanced (ΣP = 0)'
			};
		}
		return {
			dotClass: 'bg-warning',
			label: 'Solved (MNA)'
		};
	});

	function commitToolbarFrequency() {
		const hz = Number(freqDraft);
		if (!Number.isFinite(hz) || hz <= 0) {
			freqDraft = String(circuit.document.frequencyHz);
			return;
		}
		circuit.setFrequency(hz);
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (mobileMenuOpen) mobileMenuOpen = false;
			if (freqPopoverOpen) freqPopoverOpen = false;
		}
	}

	function handleSelectPreset(preset: CircuitPreset) {
		circuit.loadPreset(preset.id);
		rightTab = 'results';
		rightRailOpen = true;
	}

	function handleImportDocument(doc: CircuitDocument) {
		circuit.loadDocument(doc);
		rightTab = 'results';
		rightRailOpen = true;
	}

	function handleCanvasComponentInspect(id: string) {
		circuit.selectComponent(id);
		rightTab = 'inspector';
		rightRailOpen = true;
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<svelte:head>
	<title>{circuit.document.name ? `${circuit.document.name} — Circuit Lab` : 'Circuit Lab'}</title>
</svelte:head>

<div class="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
	<!-- Top Toolbar -->
	<header class="flex h-14 shrink-0 items-center justify-between gap-1.5 border-b border-border bg-surface-rail px-2 sm:gap-2 sm:px-3 lg:h-11">
		<!-- Left: Rail Toggle, Brand, Mode & Telemetry -->
		<div class="flex min-w-0 items-center gap-1.5 sm:gap-2">
			<Tooltip
				content={leftRailOpen ? 'Collapse component palette' : 'Expand component palette'}
				side="bottom"
				class="hidden lg:inline-flex"
			>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
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

			<div class="flex min-w-0 items-center gap-2">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.85"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
					class="size-[18px] shrink-0 text-foreground"
				>
					<path d="M3 12h3.5l1.75-4.5 2.5 9 2.5-9 2.5 9L17.5 12H21" />
					<circle cx="3" cy="12" r="1.4" fill="currentColor" stroke="none" />
					<circle cx="21" cy="12" r="1.4" fill="currentColor" stroke="none" />
				</svg>
				<span class="truncate text-[13px] font-semibold tracking-tight text-foreground sm:shrink-0">
					Circuit Lab
				</span>
				{#if circuit.document.name}
					<span class="hidden max-w-[180px] truncate text-xs text-muted-foreground xl:inline">
						/ {circuit.document.name}
					</span>
				{/if}
			</div>

			<!-- Compact Live Status Dot (< sm) -->
			<span
				role="status"
				aria-label={statusInfo.label}
				title={statusInfo.label}
				class={cn('h-2 w-2 shrink-0 rounded-full sm:hidden', statusInfo.dotClass)}
			></span>

			<Separator orientation="vertical" class="mx-1 hidden h-4 sm:block" />

			<!-- DC / AC Segmented Mode Control -->
			<div
				role="radiogroup"
				aria-label="Analysis mode"
				class="inline-flex h-11 shrink-0 items-center rounded-[4px] border border-border bg-muted/80 p-0 lg:h-7 lg:p-0.5"
			>
				<button
					type="button"
					role="radio"
					aria-checked={circuit.document.mode === 'dc'}
					onclick={() => circuit.setMode('dc')}
					class={cn(
						'inline-flex h-11 cursor-pointer items-center justify-center rounded-[3px] border px-2.5 text-xs transition-colors duration-150 lg:h-full lg:px-2.5',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
						circuit.document.mode === 'dc'
							? 'border-border/80 bg-card font-semibold text-foreground'
							: 'border-transparent font-medium text-muted-foreground hover:text-foreground'
					)}
				>
					DC
				</button>
				<button
					type="button"
					role="radio"
					aria-checked={circuit.document.mode === 'ac'}
					onclick={() => circuit.setMode('ac')}
					class={cn(
						'inline-flex h-11 cursor-pointer items-center justify-center rounded-[3px] border px-2.5 text-xs transition-colors duration-150 lg:h-full lg:px-2.5',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
						circuit.document.mode === 'ac'
							? 'border-border/80 bg-card font-semibold text-foreground'
							: 'border-transparent font-medium text-muted-foreground hover:text-foreground'
					)}
				>
					AC
				</button>
			</div>

			{#if circuit.document.mode === 'ac'}
				<!-- Compact Mobile AC Frequency Trigger (< md) -->
				<button
					type="button"
					aria-label="Edit AC frequency"
					aria-expanded={freqPopoverOpen}
					aria-haspopup="dialog"
					onclick={() => {
						mobileMenuOpen = false;
						freqPopoverOpen = !freqPopoverOpen;
					}}
					class="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-[4px] border border-input bg-card px-2 font-engineering text-xs text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
				>
					{formatFrequency(circuit.document.frequencyHz)}
				</button>

				<!-- Inline AC Frequency Input (md+) -->
				<div class="relative hidden items-center md:flex">
					<Input
						type="number"
						min="0.001"
						step="any"
						tabular
						aria-label="AC frequency in Hertz"
						bind:value={freqDraft}
						onblur={commitToolbarFrequency}
						onkeydown={(e) => {
							if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
						}}
						class="h-11 w-24 pr-7 text-base md:text-sm lg:h-7 lg:w-24 lg:text-xs"
					/>
					<span class="pointer-events-none absolute right-2 font-engineering text-[11px] text-muted-foreground">
						Hz
					</span>
				</div>
			{/if}

			<Separator orientation="vertical" class="mx-0.5 hidden h-4 sm:block" />

			<!-- Inline Hairline Telemetry Indicator (sm+) -->
			<span
				role="status"
				aria-label={statusInfo.label}
				title={statusInfo.label}
				class="hidden shrink-0 items-center gap-1.5 font-engineering text-[11px] sm:inline-flex"
			>
				<span
					class={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusInfo.dotClass)}
					aria-hidden="true"
				></span>
				{#if isEmpty}
					<span class="text-muted-foreground">Empty</span>
				{:else if errorCount > 0 || !circuit.solution.mna.valid}
					<span class="font-medium text-destructive">
						{errorCount > 0
							? `${errorCount} ${errorCount === 1 ? 'Error' : 'Errors'}`
							: 'Invalid'}
					</span>
				{:else if isVerified}
					<span class="text-foreground">
						Verified<span class="hidden text-muted-foreground lg:inline">{' · ΣP = 0'}</span>
					</span>
				{:else}
					<span class="text-foreground">Solved (MNA)</span>
				{/if}
			</span>
		</div>

		<!-- Right: Dialog Launchers, Theme Toggle, Overflow Menu & Inspector Toggle -->
		<div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
			<div class="hidden items-center gap-0.5 md:flex">
				<Tooltip content="Browse curated DC & AC circuit presets" side="bottom">
					<Button
						variant="ghost"
						size="sm"
						class="h-11 px-2.5 text-xs font-medium text-foreground/85 hover:bg-accent hover:text-foreground lg:h-7 lg:px-2"
						onclick={() => (presetsOpen = true)}
					>
						<BookOpen />
						<span>Presets</span>
					</Button>
				</Tooltip>
				<Tooltip content="Import or export Circuit Lab JSON" side="bottom">
					<Button
						variant="ghost"
						size="sm"
						class="h-11 px-2.5 text-xs font-medium text-foreground/85 hover:bg-accent hover:text-foreground lg:h-7 lg:px-2"
						onclick={() => (jsonOpen = true)}
					>
						<FileCode2 />
						<span>JSON</span>
					</Button>
				</Tooltip>
				<Tooltip content="Convert circuit image or textbook netlist via AI" side="bottom">
					<Button
						variant="ghost"
						size="sm"
						class="h-11 px-2.5 text-xs font-medium text-foreground/85 hover:bg-accent hover:text-foreground lg:h-7 lg:px-2"
						onclick={() => (aiOpen = true)}
					>
						<ScanLine />
						<span class="hidden lg:inline">AI Import</span>
						<span class="lg:hidden">AI</span>
					</Button>
				</Tooltip>

				<Separator orientation="vertical" class="mx-1 h-4" />

				<Tooltip content="Workbench preferences & IEEE/IEC standard" side="bottom">
					<Button
						variant="ghost"
						size="icon"
						class="h-11 w-11 lg:h-7 lg:w-7"
						aria-label="Workbench settings"
						onclick={() => (settingsOpen = true)}
					>
						<Settings />
					</Button>
				</Tooltip>
			</div>

			<Tooltip content={isDark ? 'Switch to light mode' : 'Switch to dark mode'} side="bottom">
				<Button
					variant="ghost"
					size="icon"
					class="h-11 w-11 lg:h-7 lg:w-7"
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

			<!-- Mobile Overflow Actions Trigger (< md) -->
			<Button
				variant="ghost"
				size="icon"
				class="h-11 w-11 md:hidden"
				aria-label="More actions"
				aria-haspopup="menu"
				aria-expanded={mobileMenuOpen}
				onclick={() => {
					freqPopoverOpen = false;
					mobileMenuOpen = !mobileMenuOpen;
				}}
			>
				<MoreVertical />
			</Button>

			<Tooltip
				content={rightRailOpen ? 'Collapse results & inspector' : 'Expand results & inspector'}
				side="bottom"
				class="hidden lg:inline-flex"
			>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					aria-label={rightRailOpen
						? 'Collapse results and inspector'
						: 'Expand results and inspector'}
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

	<!-- Mobile AC Frequency Popover (< md) -->
	{#if freqPopoverOpen && circuit.document.mode === 'ac'}
		<button
			type="button"
			tabindex="-1"
			aria-label="Close frequency editor"
			onclick={() => (freqPopoverOpen = false)}
			class="fixed inset-0 z-40 cursor-default bg-transparent md:hidden"
		></button>
		<div
			role="dialog"
			aria-label="AC frequency settings"
			class="fixed top-[60px] right-2 left-2 z-50 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl sm:right-auto sm:left-3 sm:w-72 md:hidden"
		>
			<div class="mb-2 flex items-center justify-between gap-2">
				<span class="text-xs font-semibold text-foreground">AC Source Frequency (Hz)</span>
				<span class="font-engineering text-xs text-muted-foreground">
					{formatFrequency(circuit.document.frequencyHz)}
				</span>
			</div>
			<div class="flex items-center gap-2">
				<Input
					type="number"
					min="0.001"
					step="any"
					tabular
					aria-label="AC frequency in Hertz"
					bind:value={freqDraft}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							commitToolbarFrequency();
							freqPopoverOpen = false;
						} else if (e.key === 'Escape') {
							freqPopoverOpen = false;
						}
					}}
					class="h-11 text-base sm:text-base"
				/>
				<Button
					variant="default"
					class="h-11 shrink-0 px-4"
					onclick={() => {
						commitToolbarFrequency();
						freqPopoverOpen = false;
					}}
				>
					Apply
				</Button>
			</div>
		</div>
	{/if}

	<!-- Mobile Overflow Actions Menu (< md) -->
	{#if mobileMenuOpen}
		<button
			type="button"
			tabindex="-1"
			aria-label="Close actions menu"
			onclick={() => (mobileMenuOpen = false)}
			class="fixed inset-0 z-40 cursor-default bg-transparent md:hidden"
		></button>
		<div
			role="menu"
			aria-label="More actions"
			class="fixed top-[60px] right-2 z-50 flex w-56 flex-col gap-0.5 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl md:hidden"
		>
			<button
				type="button"
				role="menuitem"
				onclick={() => {
					mobileMenuOpen = false;
					presetsOpen = true;
				}}
				class="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<BookOpen class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span>Presets</span>
			</button>
			<button
				type="button"
				role="menuitem"
				onclick={() => {
					mobileMenuOpen = false;
					jsonOpen = true;
				}}
				class="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<FileCode2 class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span>JSON Import / Export</span>
			</button>
			<button
				type="button"
				role="menuitem"
				onclick={() => {
					mobileMenuOpen = false;
					aiOpen = true;
				}}
				class="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<ScanLine class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span>AI Import</span>
			</button>
			<Separator class="my-1" />
			<button
				type="button"
				role="menuitem"
				onclick={() => {
					mobileMenuOpen = false;
					settingsOpen = true;
				}}
				class="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<Settings class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span>Settings</span>
			</button>
		</div>
	{/if}

	<!-- Main 3-Pane Responsive Workbench -->
	<div class="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden">
		<!-- Left Component Palette Rail (Desktop lg+) -->
		{#if leftRailOpen}
			<ComponentPalette class="hidden lg:flex" />
		{/if}

		<!-- Center Interactive Schematic Canvas -->
		<main
			class={cn(
				'relative min-w-0 flex-1 flex-col overflow-hidden',
				mobileTab === 'canvas' ? 'flex' : 'hidden lg:flex'
			)}
		>
			<SchematicCanvas
				onOpenPresets={() => (presetsOpen = true)}
				onOpenImport={() => (jsonOpen = true)}
				onOpenAiImport={() => (aiOpen = true)}
				onComponentInspect={handleCanvasComponentInspect}
				onOpenPalette={() => (paletteSheetOpen = true)}
				onMobileInspect={(id) => {
					if (id) circuit.selectComponent(id);
					mobileTab = 'inspector';
				}}
			/>
		</main>

		<!-- Mobile & Tablet Full-Pane Results / Inspector Views (< lg) -->
		{#if mobileTab === 'results'}
			<section
				aria-label="Circuit analysis results"
				class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-card p-0 lg:hidden"
			>
				{#if circuit.selectedComponent}
					<div class="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface-rail/90 px-4 py-1.5 text-xs backdrop-blur-xs">
						<div class="flex min-w-0 items-center gap-1.5">
							<span class="text-muted-foreground">Selected:</span>
							<span class="font-engineering truncate font-semibold text-warning">
								{circuit.selectedComponent.label}
							</span>
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<Button
								variant="ghost"
								size="sm"
								class="min-h-11 px-2.5 text-xs"
								onclick={() => (mobileTab = 'inspector')}
							>
								<SlidersHorizontal class="size-3.5" aria-hidden="true" />
								<span>Inspect</span>
							</Button>
							<Button
								variant="outline"
								size="sm"
								class="min-h-11 px-2.5 text-xs"
								onclick={() => (mobileTab = 'canvas')}
							>
								<span>Canvas</span>
							</Button>
						</div>
					</div>
				{/if}

				<div class="min-w-0 flex-1">
					<ResultsPanel
						solution={circuit.solution}
						document={circuit.document}
						selectedComponentId={circuit.selectedComponentId}
						bind:activeMethod={circuit.activeMethod}
						onSelectComponent={(id) => circuit.selectComponent(id)}
						onSelectTheveninComponent={(id) => circuit.setTheveninComponent(id)}
					/>
				</div>
			</section>
		{:else if mobileTab === 'inspector'}
			<section
				aria-label="Element property inspector"
				class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-card p-0 lg:hidden"
			>
				<PropertyInspector />
			</section>
		{/if}

		<!-- Right Results & Inspector Panel (Desktop lg+) -->
		{#if rightRailOpen}
			<aside
				aria-label="Results and element inspector"
				class="hidden w-[360px] shrink-0 flex-col border-l border-border bg-card lg:flex lg:w-[380px] xl:w-[440px] 2xl:w-[460px]"
			>
				<Tabs
					value={rightTab}
					variant="underline"
					onValueChange={(next) => {
						if (next === 'results' || next === 'inspector') {
							rightTab = next;
						}
					}}
					class="flex min-h-0 flex-1 flex-col"
				>
					<TabsList class="grid h-9 w-full shrink-0 grid-cols-2 gap-0 px-4">
						<TabsTrigger value="results" class="w-full">Results</TabsTrigger>
						<TabsTrigger value="inspector" class="w-full gap-1.5">
							<span>Inspector</span>
							{#if circuit.selectedComponent}
								<Badge variant="warning" class="font-engineering px-1 py-0 text-[10px]">
									{circuit.selectedComponent.label}
								</Badge>
							{:else if circuit.selectedWire}
								<Badge variant="warning" class="font-engineering px-1 py-0 text-[10px]">
									{circuit.selectedWire.id}
								</Badge>
							{/if}
						</TabsTrigger>
					</TabsList>

					{#if rightTab === 'results' && circuit.selectedComponent}
						<div class="flex items-center justify-between gap-2 border-b border-border bg-surface-rail/70 px-4 py-1.5 text-xs">
							<div class="flex min-w-0 items-center gap-1.5">
								<span class="text-muted-foreground">Selected:</span>
								<span class="font-engineering font-semibold text-warning">
									{circuit.selectedComponent.label}
								</span>
							</div>
							<Button
								variant="ghost"
								size="sm"
								class="h-6 px-2 text-[11px]"
								onclick={() => (rightTab = 'inspector')}
							>
								<SlidersHorizontal class="size-3" aria-hidden="true" />
								Edit Properties
							</Button>
						</div>
					{/if}

					<div class="flex-1 overflow-y-auto p-0">
						<TabsContent value="results">
							<ResultsPanel
								solution={circuit.solution}
								document={circuit.document}
								selectedComponentId={circuit.selectedComponentId}
								bind:activeMethod={circuit.activeMethod}
								onSelectComponent={(id) => circuit.selectComponent(id)}
								onSelectTheveninComponent={(id) => circuit.setTheveninComponent(id)}
							/>
						</TabsContent>

						<TabsContent value="inspector">
							<PropertyInspector />
						</TabsContent>
					</div>
				</Tabs>
			</aside>
		{/if}
	</div>

	<!-- Mobile & Tablet Bottom Navigation Bar (< lg) -->
	<nav
		aria-label="Workspace navigation"
		class="flex shrink-0 border-t border-border bg-surface-rail pb-safe lg:hidden"
	>
		<button
			type="button"
			aria-current={mobileTab === 'canvas' ? 'page' : undefined}
			onclick={() => (mobileTab = 'canvas')}
			class={cn(
				'relative flex min-h-[52px] flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[11px] transition-colors duration-150',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
				mobileTab === 'canvas'
					? 'font-semibold text-foreground'
					: 'font-medium text-muted-foreground hover:text-foreground'
			)}
		>
			{#if mobileTab === 'canvas'}
				<span
					class="absolute top-0 right-3 left-3 h-0.5 bg-primary"
					aria-hidden="true"
				></span>
			{/if}
			<CircuitBoard class="size-4" aria-hidden="true" />
			<span>Canvas</span>
		</button>

		<button
			type="button"
			aria-current={mobileTab === 'results' ? 'page' : undefined}
			onclick={() => (mobileTab = 'results')}
			class={cn(
				'relative flex min-h-[52px] flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[11px] transition-colors duration-150',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
				mobileTab === 'results'
					? 'font-semibold text-foreground'
					: 'font-medium text-muted-foreground hover:text-foreground'
			)}
		>
			{#if mobileTab === 'results'}
				<span
					class="absolute top-0 right-3 left-3 h-0.5 bg-primary"
					aria-hidden="true"
				></span>
			{/if}
			<span class="relative inline-flex items-center justify-center">
				<BarChart3 class="size-4" aria-hidden="true" />
				{#if !isEmpty && (errorCount > 0 || !circuit.solution.mna.valid)}
					<span
						class="absolute -top-0.5 -right-1.5 h-2 w-2 rounded-full bg-destructive ring-1 ring-surface-rail"
						aria-hidden="true"
					></span>
				{:else if !isEmpty && circuit.solution.mna.valid}
					<span
						class="absolute -top-0.5 -right-1.5 h-2 w-2 rounded-full bg-branch-current ring-1 ring-surface-rail"
						aria-hidden="true"
					></span>
				{/if}
			</span>
			<span>Results</span>
		</button>

		<button
			type="button"
			aria-current={mobileTab === 'inspector' ? 'page' : undefined}
			onclick={() => (mobileTab = 'inspector')}
			class={cn(
				'relative flex min-h-[52px] flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[11px] transition-colors duration-150',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
				mobileTab === 'inspector'
					? 'font-semibold text-foreground'
					: 'font-medium text-muted-foreground hover:text-foreground'
			)}
		>
			{#if mobileTab === 'inspector'}
				<span
					class="absolute top-0 right-3 left-3 h-0.5 bg-primary"
					aria-hidden="true"
				></span>
			{/if}
			<SlidersHorizontal class="size-4" aria-hidden="true" />
			<span class="inline-flex max-w-full items-center gap-1">
				<span>Inspector</span>
				{#if circuit.selectedComponent}
					<Badge
						variant="warning"
						class="font-engineering max-w-14 truncate px-1 py-0 text-[10px] leading-tight"
					>
						{circuit.selectedComponent.label}
					</Badge>
				{:else if circuit.selectedWire}
					<Badge
						variant="warning"
						class="font-engineering max-w-14 truncate px-1 py-0 text-[10px] leading-tight"
					>
						{circuit.selectedWire.id}
					</Badge>
				{/if}
			</span>
		</button>
	</nav>
</div>

<!-- Mobile Component Palette Sheet -->
<Sheet
	bind:open={paletteSheetOpen}
	title="Component Palette"
	description="Tap a component or tool to arm placement on the canvas."
>
	{#if paletteSheetOpen}
		<ComponentPalette
			variant="sheet"
			onSelectTool={() => {
				paletteSheetOpen = false;
				mobileTab = 'canvas';
			}}
		/>
	{/if}
</Sheet>

<!-- Real Workbench Dialogs -->
<PresetsDialog bind:open={presetsOpen} onSelectPreset={handleSelectPreset} />
<JsonDialog
	bind:open={jsonOpen}
	document={circuit.document}
	onImportDocument={handleImportDocument}
/>
<ImportFromAIDialog bind:open={aiOpen} onImportDocument={handleImportDocument} />
<SettingsDialog bind:open={settingsOpen} />
