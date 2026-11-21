<script lang="ts">
	import { mode, toggleMode } from 'mode-watcher';
	import {
		AlertCircle,
		BookOpen,
		CheckCircle2,
		Cpu,
		FileCode2,
		Moon,
		PanelLeftClose,
		PanelLeftOpen,
		PanelRightClose,
		PanelRightOpen,
		Settings,
		SlidersHorizontal,
		Sparkles,
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
	import { ResultsPanel } from '$lib/components/results';
	import {
		Badge,
		Button,
		Input,
		Separator,
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

	let presetsOpen = $state(false);
	let jsonOpen = $state(false);
	let aiOpen = $state(false);
	let settingsOpen = $state(false);

	let freqDraft = $state(String(circuit.document.frequencyHz));

	$effect(() => {
		freqDraft = String(circuit.document.frequencyHz);
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

	function commitToolbarFrequency() {
		const hz = Number(freqDraft);
		if (!Number.isFinite(hz) || hz <= 0) {
			freqDraft = String(circuit.document.frequencyHz);
			return;
		}
		circuit.setFrequency(hz);
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

<svelte:head>
	<title>{circuit.document.name ? `${circuit.document.name} — Circuit Lab` : 'Circuit Lab'}</title>
</svelte:head>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
	<!-- Top Toolbar -->
	<header class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface-rail px-3">
		<!-- Left: Rail Toggle, Brand, Mode & Verification -->
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

			<div class="flex min-w-0 items-center gap-2">
				<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
					<Cpu class="size-4" aria-hidden="true" />
				</div>
				<span class="shrink-0 text-sm font-semibold tracking-tight text-foreground">
					Circuit Lab
				</span>
				{#if circuit.document.name}
					<span class="hidden max-w-[180px] truncate text-xs text-muted-foreground xl:inline">
						/ {circuit.document.name}
					</span>
				{/if}
			</div>

			<Separator orientation="vertical" class="mx-1 hidden h-5 sm:block" />

			<!-- DC / AC Segmented Mode Control -->
			<div
				role="radiogroup"
				aria-label="Analysis mode"
				class="inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-background p-0.5"
			>
				<button
					type="button"
					role="radio"
					aria-checked={circuit.document.mode === 'dc'}
					onclick={() => circuit.setMode('dc')}
					class={cn(
						'cursor-pointer rounded-sm px-2.5 py-1 text-xs font-medium transition-colors duration-150',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						circuit.document.mode === 'dc'
							? 'bg-primary text-primary-foreground shadow-2xs'
							: 'text-muted-foreground hover:text-foreground'
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
						'cursor-pointer rounded-sm px-2.5 py-1 text-xs font-medium transition-colors duration-150',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						circuit.document.mode === 'ac'
							? 'bg-primary text-primary-foreground shadow-2xs'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					AC
				</button>
			</div>

			{#if circuit.document.mode === 'ac'}
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
						class="h-7 w-24 pr-7 text-xs"
					/>
					<span class="pointer-events-none absolute right-2 font-engineering text-[11px] text-muted-foreground">
						Hz
					</span>
				</div>
			{/if}

			<!-- Live Verification Status Badge -->
			{#if isEmpty}
				<Badge variant="secondary" class="hidden sm:inline-flex">Empty</Badge>
			{:else if errorCount > 0 || !circuit.solution.mna.valid}
				<Badge variant="destructive" class="hidden gap-1 sm:inline-flex">
					<AlertCircle class="size-3" aria-hidden="true" />
					{errorCount > 0 ? `${errorCount} ${errorCount === 1 ? 'Error' : 'Errors'}` : 'Invalid'}
				</Badge>
			{:else if isVerified}
				<Badge variant="success" class="hidden gap-1 font-engineering sm:inline-flex">
					<CheckCircle2 class="size-3" aria-hidden="true" />
					Verified · ΣP = 0
				</Badge>
			{:else}
				<Badge variant="warning" class="hidden sm:inline-flex">Solved (MNA)</Badge>
			{/if}
		</div>

		<!-- Right: Dialog Launchers, Theme Toggle & Inspector Toggle -->
		<div class="flex shrink-0 items-center gap-1.5">
			<Tooltip content="Browse curated DC & AC circuit presets" side="bottom">
				<Button variant="outline" size="sm" onclick={() => (presetsOpen = true)}>
					<BookOpen />
					<span>Presets</span>
				</Button>
			</Tooltip>
			<Tooltip content="Import or export Circuit Lab JSON" side="bottom">
				<Button variant="outline" size="sm" onclick={() => (jsonOpen = true)}>
					<FileCode2 />
					<span>JSON</span>
				</Button>
			</Tooltip>
			<Tooltip content="Convert circuit image or textbook netlist via AI" side="bottom">
				<Button variant="secondary" size="sm" onclick={() => (aiOpen = true)}>
					<Sparkles />
					<span class="hidden sm:inline">AI Import</span>
				</Button>
			</Tooltip>

			<Separator orientation="vertical" class="mx-0.5 h-5" />

			<Tooltip content="Workbench preferences & IEEE/IEC standard" side="bottom">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Workbench settings"
					onclick={() => (settingsOpen = true)}
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

			<Tooltip content={rightRailOpen ? 'Collapse results & inspector' : 'Expand results & inspector'} side="bottom">
				<Button
					variant="ghost"
					size="icon"
					aria-label={rightRailOpen ? 'Collapse results and inspector' : 'Expand results and inspector'}
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

	<!-- Main 3-Pane Responsive Workbench -->
	<div class="flex h-[calc(100vh-3rem)] min-h-0 w-full min-w-0 overflow-hidden">
		<!-- Left Component Palette Rail -->
		{#if leftRailOpen}
			<ComponentPalette />
		{/if}

		<!-- Center Interactive Schematic Canvas -->
		<main class="relative flex min-w-0 flex-1 flex-col overflow-hidden">
			<SchematicCanvas
				onOpenPresets={() => (presetsOpen = true)}
				onOpenImport={() => (jsonOpen = true)}
				onOpenAiImport={() => (aiOpen = true)}
				onComponentInspect={handleCanvasComponentInspect}
			/>
		</main>

		<!-- Right Results & Inspector Panel -->
		{#if rightRailOpen}
			<aside
				aria-label="Results and element inspector"
				class="flex w-[360px] shrink-0 flex-col border-l border-border bg-surface-rail lg:w-[380px] xl:w-[440px] 2xl:w-[460px]"
			>
				<Tabs
					value={rightTab}
					onValueChange={(next) => {
						if (next === 'results' || next === 'inspector') {
							rightTab = next;
						}
					}}
					class="flex min-h-0 flex-1 flex-col"
				>
					<div class="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
						<TabsList class="grid w-full grid-cols-2">
							<TabsTrigger value="results">Results</TabsTrigger>
							<TabsTrigger value="inspector" class="gap-1.5">
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
					</div>

					{#if rightTab === 'results' && circuit.selectedComponent}
						<div class="flex items-center justify-between gap-2 border-b border-border bg-card/70 px-3 py-1.5 text-xs">
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

					<div class="flex-1 overflow-y-auto p-3">
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
</div>

<!-- Real Workbench Dialogs -->
<PresetsDialog bind:open={presetsOpen} onSelectPreset={handleSelectPreset} />
<JsonDialog
	bind:open={jsonOpen}
	document={circuit.document}
	onImportDocument={handleImportDocument}
/>
<ImportFromAIDialog bind:open={aiOpen} onImportDocument={handleImportDocument} />
<SettingsDialog bind:open={settingsOpen} />
