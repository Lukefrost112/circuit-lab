<script lang="ts">
	import { AlertCircle, Check, CheckCircle2, Copy, Download, Link2, Upload } from 'lucide-svelte';
	import {
		Button,
		Dialog,
		Tabs,
		TabsContent,
		TabsList,
		TabsTrigger
	} from '$lib/components/ui';
	import { exportCircuitJson, parseCircuitImport } from '$lib/engine/io';
	import type { CircuitDocument } from '$lib/engine/types';

	type Props = {
		open?: boolean;
		document: CircuitDocument;
		onImportDocument: (doc: CircuitDocument) => void;
		onCopyShareLink?: () => Promise<boolean>;
		linkCopied?: boolean;
	};

	let {
		open = $bindable(false),
		document,
		onImportDocument,
		onCopyShareLink,
		linkCopied = false
	}: Props = $props();

	let activeTab = $state<'export' | 'import'>('export');
	let copied = $state(false);
	let importText = $state('');
	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);

	const exportedJson = $derived(exportCircuitJson(document));
	const parsedResult = $derived(
		importText.trim() === '' ? null : parseCircuitImport(importText)
	);

	async function copyExportJson() {
		try {
			await navigator.clipboard.writeText(exportedJson);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			// Fallback ignored when clipboard unavailable
		}
	}

	function downloadJsonFile() {
		const slug = (document.name ?? document.id ?? 'circuit-lab')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'circuit-lab';

		const blob = new Blob([exportedJson], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = window.document.createElement('a');
		anchor.href = url;
		anchor.download = `${slug}.json`;
		window.document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}

	async function handleFileSelected(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importText = await file.text();
		input.value = '';
	}

	function handleConfirmImport() {
		if (!parsedResult || !parsedResult.ok) return;
		onImportDocument(parsedResult.document);
		importText = '';
		open = false;
	}
</script>

<Dialog
	bind:open
	title="Circuit JSON Import / Export"
	description="Export the current schematic as canonical Circuit Lab JSON, or import an existing JSON circuit or netlist."
	class="sm:max-w-2xl"
>
	<Tabs
		value={activeTab}
		variant="underline"
		onValueChange={(next) => {
			activeTab = next as 'export' | 'import';
		}}
		class="gap-3.5"
	>
		<TabsList class="h-auto w-full gap-4 sm:gap-5">
			<TabsTrigger value="export" class="min-h-11 px-1 sm:h-9 sm:min-h-0">Export JSON</TabsTrigger>
			<TabsTrigger value="import" class="min-h-11 px-1 sm:h-9 sm:min-h-0">Import JSON</TabsTrigger>
		</TabsList>

		<TabsContent value="export" class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<span class="font-engineering text-xs text-muted-foreground">
					{document.components.length} components · {document.wires.length} wires
				</span>
				<div class="flex flex-wrap items-center gap-2">
					{#if onCopyShareLink}
						<Button
							variant="outline"
							size="sm"
							onclick={onCopyShareLink}
							class="min-h-11 sm:min-h-0"
						>
							{#if linkCopied}
								<Check class="size-3.5 text-success" aria-hidden="true" />
								Link Copied!
							{:else}
								<Link2 class="size-3.5" aria-hidden="true" />
								Copy Link
							{/if}
						</Button>
					{/if}
					<Button variant="outline" size="sm" onclick={copyExportJson} class="min-h-11 sm:min-h-0">
						{#if copied}
							<Check class="size-3.5 text-success" aria-hidden="true" />
							Copied!
						{:else}
							<Copy class="size-3.5" aria-hidden="true" />
							Copy JSON
						{/if}
					</Button>
					<Button variant="default" size="sm" onclick={downloadJsonFile} class="min-h-11 sm:min-h-0">
						<Download class="size-3.5" aria-hidden="true" />
						Download .json
					</Button>
				</div>
			</div>

			<textarea
				readonly
				aria-label="Exported circuit JSON"
				value={exportedJson}
				rows={13}
				class="font-engineering w-full resize-y rounded-[4px] border border-input bg-surface-rail/60 p-3 text-base leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-xs"
			></textarea>
		</TabsContent>

		<TabsContent value="import" class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-xs text-muted-foreground">
					Paste Circuit Lab JSON or upload a <code class="font-engineering">.json</code> file.
				</p>
				<div>
					<input
						bind:this={fileInputEl}
						type="file"
						accept=".json,application/json"
						onchange={handleFileSelected}
						class="sr-only"
						aria-label="Upload JSON file"
					/>
					<Button
						variant="outline"
						size="sm"
						onclick={() => fileInputEl?.click()}
						class="min-h-11 sm:min-h-0"
					>
						<Upload class="size-3.5" aria-hidden="true" />
						Upload .json File
					</Button>
				</div>
			</div>

			<textarea
				bind:value={importText}
				aria-label="Paste circuit JSON to import"
				placeholder={'{\n  "schemaVersion": 1,\n  "mode": "dc",\n  "components": [...],\n  "wires": [...]\n}'}
				rows={10}
				class="font-engineering w-full resize-y rounded-[4px] border border-input bg-background p-3 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-xs"
			></textarea>

			{#if parsedResult}
				{#if parsedResult.ok}
					<div
						class="flex flex-col gap-1 rounded-[4px] border border-success/40 bg-success/10 px-3 py-2 text-xs"
					>
						<div class="flex items-center gap-1.5 font-semibold text-success">
							<CheckCircle2 class="size-4 shrink-0" aria-hidden="true" />
							Ready to import: {parsedResult.document.components.length} components
							({parsedResult.sourceFormat === 'ai-netlist'
								? parsedResult.layoutMode === 'visual-grid'
									? 'AI Netlist → Exact Visual Layout'
									: 'AI Netlist → Auto-Layout'
								: 'Circuit Document'})
						</div>
						{#if parsedResult.warnings.length > 0}
							<ul class="list-disc pl-5 text-[11px] text-muted-foreground">
								{#each parsedResult.warnings as warning, idx (idx)}
									<li>{warning}</li>
								{/each}
							</ul>
						{/if}
					</div>
				{:else}
					<div
						role="alert"
						class="flex flex-col gap-1 rounded-[4px] border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
					>
						<div class="flex items-center gap-1.5 font-semibold">
							<AlertCircle class="size-4 shrink-0" aria-hidden="true" />
							Invalid JSON Import
						</div>
						<ul class="list-disc pl-5 text-[11px]">
							{#each parsedResult.errors as err, idx (idx)}
								<li>{err}</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}

			<div class="flex flex-wrap items-center justify-end gap-2">
				<Button
					variant="default"
					size="sm"
					disabled={!parsedResult?.ok}
					onclick={handleConfirmImport}
					class="min-h-11 sm:min-h-0"
				>
					Load Circuit
				</Button>
			</div>
		</TabsContent>
	</Tabs>

	{#snippet footer()}
		<Button variant="outline" size="sm" onclick={() => (open = false)} class="min-h-11 sm:min-h-0">
			Close
		</Button>
	{/snippet}
</Dialog>
