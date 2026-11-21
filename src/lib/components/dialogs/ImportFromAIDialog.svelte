<script lang="ts">
	import {
		AlertCircle,
		Check,
		CheckCircle2,
		ChevronDown,
		Copy,
		FlaskConical,
		Sparkles
	} from 'lucide-svelte';
	import { Badge, Button, Dialog } from '$lib/components/ui';
	import { AI_CIRCUIT_IMPORT_PROMPT, parseCircuitImport } from '$lib/engine/io';
	import type { CircuitDocument } from '$lib/engine/types';
	import { cn } from '$lib/utils';

	type Props = {
		open?: boolean;
		onImportDocument: (doc: CircuitDocument) => void;
	};

	const SAMPLE_AI_NETLIST = JSON.stringify(
		{
			schemaVersion: 1,
			name: 'AI Imported Bridge Divider',
			mode: 'dc',
			elements: [
				{ id: 'V1', kind: 'voltage_source', label: 'V1', from: 'N1', to: '0', value: '18' },
				{ id: 'R1', kind: 'resistor', label: 'R1', from: 'N1', to: 'N2', value: '3k' },
				{ id: 'R2', kind: 'resistor', label: 'R2', from: 'N2', to: '0', value: '6k' },
				{ id: 'R3', kind: 'resistor', label: 'R3', from: 'N2', to: 'N3', value: '2k' },
				{ id: 'R4', kind: 'resistor', label: 'R4', from: 'N3', to: '0', value: '4k' }
			]
		},
		null,
		2
	);

	let { open = $bindable(false), onImportDocument }: Props = $props();

	let promptExpanded = $state(false);
	let promptCopied = $state(false);
	let aiOutputText = $state('');

	const parseResult = $derived(
		aiOutputText.trim() === '' ? null : parseCircuitImport(aiOutputText)
	);

	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(AI_CIRCUIT_IMPORT_PROMPT);
			promptCopied = true;
			setTimeout(() => {
				promptCopied = false;
			}, 2000);
		} catch {
			// Ignore if clipboard API is unavailable
		}
	}

	function loadSampleNetlist() {
		aiOutputText = SAMPLE_AI_NETLIST;
	}

	function handleRenderAndSolve() {
		if (!parseResult || !parseResult.ok) return;
		onImportDocument(parseResult.document);
		aiOutputText = '';
		open = false;
	}
</script>

<Dialog
	bind:open
	title="Import Circuit from AI"
	description="Convert any textbook schematic or photo into an editable, auto-laid-out Circuit Lab schematic."
	class="max-w-2xl"
>
	<div class="flex flex-col gap-4">
		<!-- Step 1 — Copy Prompt -->
		<section class="rounded-lg border border-border bg-surface-rail/40 p-3.5">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<Badge variant="default" class="font-engineering">Step 1</Badge>
					<h3 class="text-xs font-semibold text-foreground">Copy the AI Netlist Prompt</h3>
				</div>

				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={() => (promptExpanded = !promptExpanded)}
						aria-expanded={promptExpanded}
						class="inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{promptExpanded ? 'Hide Prompt' : 'Preview Prompt'}
						<ChevronDown
							class={cn(
								'size-3.5 transition-transform duration-150',
								promptExpanded && 'rotate-180'
							)}
							aria-hidden="true"
						/>
					</button>
					<Button variant="default" size="sm" onclick={copyPrompt}>
						{#if promptCopied}
							<Check class="size-3.5" aria-hidden="true" />
							Copied!
						{:else}
							<Copy class="size-3.5" aria-hidden="true" />
							Copy AI Prompt
						{/if}
					</Button>
				</div>
			</div>

			{#if promptExpanded}
				<pre
					class="font-engineering mt-2.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card p-2.5 text-[11px] leading-relaxed text-muted-foreground"
				>{AI_CIRCUIT_IMPORT_PROMPT}</pre>
			{/if}
		</section>

		<!-- Step 2 — Ask Any AI -->
		<section class="rounded-lg border border-border bg-surface-rail/40 px-3.5 py-2.5">
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="secondary" class="font-engineering">Step 2</Badge>
				<p class="text-xs text-foreground">
					Attach your circuit photo or textbook screenshot along with this prompt in ChatGPT,
					Claude, or Gemini.
				</p>
			</div>
		</section>

		<!-- Step 3 — Paste AI JSON & Render -->
		<section class="flex flex-col gap-2.5 rounded-lg border border-border bg-surface-rail/40 p-3.5">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<Badge variant="default" class="font-engineering">Step 3</Badge>
					<h3 class="text-xs font-semibold text-foreground">Paste AI JSON &amp; Render</h3>
				</div>

				<Button variant="outline" size="sm" onclick={loadSampleNetlist}>
					<FlaskConical class="size-3.5" aria-hidden="true" />
					Try Sample AI Netlist
				</Button>
			</div>

			<p class="text-[11px] text-muted-foreground">
				Paste the raw AI response below — markdown code fences and surrounding commentary are
				stripped automatically.
			</p>

			<textarea
				bind:value={aiOutputText}
				aria-label="Paste AI JSON output"
				placeholder={'```json\n{\n  "schemaVersion": 1,\n  "name": "My Circuit",\n  "mode": "dc",\n  "elements": [...]\n}\n```'}
				rows={8}
				class="font-engineering w-full resize-y rounded-md border border-input bg-card p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			></textarea>

			{#if parseResult}
				{#if parseResult.ok}
					{@const elementCount = parseResult.document.components.filter(
						(c) => c.kind !== 'ground' && c.kind !== 'terminal'
					).length}
					<div
						class="flex flex-col gap-1 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs"
					>
						<div class="flex flex-wrap items-center gap-2 font-semibold text-success">
							<CheckCircle2 class="size-4 shrink-0" aria-hidden="true" />
							<span>
								{parseResult.sourceFormat === 'ai-netlist'
									? 'AI Netlist → Auto-Layout'
									: 'Circuit Document'}
							</span>
							<span class="font-engineering text-[11px]">
								· {elementCount} elements ({parseResult.document.mode.toUpperCase()})
							</span>
						</div>
						{#if parseResult.warnings.length > 0}
							<ul class="list-disc pl-5 text-[11px] text-muted-foreground">
								{#each parseResult.warnings as warning, idx (idx)}
									<li>{warning}</li>
								{/each}
							</ul>
						{/if}
					</div>
				{:else}
					<div
						role="alert"
						class="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
					>
						<div class="flex items-center gap-1.5 font-semibold">
							<AlertCircle class="size-4 shrink-0" aria-hidden="true" />
							Could not parse circuit JSON
						</div>
						<ul class="list-disc pl-5 text-[11px]">
							{#each parseResult.errors as err, idx (idx)}
								<li>{err}</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}
		</section>
	</div>

	{#snippet footer()}
		<Button variant="outline" size="sm" onclick={() => (open = false)}>Cancel</Button>
		<Button
			variant="default"
			size="sm"
			disabled={!parseResult?.ok}
			onclick={handleRenderAndSolve}
		>
			<Sparkles class="size-3.5" aria-hidden="true" />
			Render &amp; Solve Circuit
		</Button>
	{/snippet}
</Dialog>
