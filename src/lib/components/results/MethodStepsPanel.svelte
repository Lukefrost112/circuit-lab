<script lang="ts">
	import { AlertTriangle, ChevronsDownUp, ChevronsUpDown, Info, ShieldCheck } from 'lucide-svelte';
	import {
		Accordion,
		AccordionItem,
		Badge,
		Button,
		Tabs,
		TabsList,
		TabsTrigger
	} from '$lib/components/ui';
	import type { FullSolveResult, MethodId } from '$lib/engine/types';
	import { cn } from '$lib/utils';
	import MathBlock from './MathBlock.svelte';

	type Props = {
		solution: FullSolveResult;
		activeMethod?: MethodId;
		class?: string;
	};

	const METHOD_TABS: Array<{ id: MethodId; label: string }> = [
		{ id: 'kcl_kvl', label: 'KCL / KVL' },
		{ id: 'nodal', label: 'Nodal' },
		{ id: 'mesh', label: 'Mesh' },
		{ id: 'superposition', label: 'Superposition' },
		{ id: 'source_transform', label: 'Source Transform' },
		{ id: 'thevenin_norton', label: 'Thévenin & Norton' }
	];

	let {
		solution,
		activeMethod = $bindable<MethodId>('nodal'),
		class: className
	}: Props = $props();

	let expandedSteps = $state<string[]>([]);
	let lastResetKey = '';

	const currentMethod = $derived(solution.methods[activeMethod]);
	const stepIds = $derived(
		(currentMethod?.steps ?? []).map((_, index) => `step-${activeMethod}-${index}`)
	);

	// Reset default-expanded steps (first 2) only when solution or activeMethod changes
	$effect(() => {
		const key = `${activeMethod}:${currentMethod?.steps.length ?? 0}:${currentMethod?.summaryLatex ?? ''}`;
		if (key !== lastResetKey) {
			lastResetKey = key;
			expandedSteps = stepIds.slice(0, 2);
		}
	});

	const allExpanded = $derived(
		stepIds.length > 0 && stepIds.every((id) => expandedSteps.includes(id))
	);

	function toggleAllSteps() {
		if (allExpanded) {
			expandedSteps = [];
		} else {
			expandedSteps = [...stepIds];
		}
	}
</script>

<div class={cn('flex flex-col gap-3', className)}>
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			Step-by-Step Analysis
		</h3>
		<span class="text-[11px] text-muted-foreground">
			All 6 methods cross-verified against MNA
		</span>
	</div>

	<Tabs
		value={activeMethod}
		onValueChange={(next) => {
			activeMethod = next as MethodId;
		}}
	>
		<TabsList class="flex h-auto w-full flex-wrap justify-start gap-1">
			{#each METHOD_TABS as tab (tab.id)}
				{@const res = solution.methods[tab.id]}
				<TabsTrigger value={tab.id} class="gap-1.5">
					<span>{tab.label}</span>
					{#if res && !res.applicable}
						<span
							class="size-1.5 rounded-full bg-warning"
							title="Not applicable to this circuit"
							aria-hidden="true"
						></span>
					{/if}
				</TabsTrigger>
			{/each}
		</TabsList>
	</Tabs>

	{#if !currentMethod}
		<div
			class="rounded-md border border-border bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground"
		>
			This solution method was not evaluated for the current solve run.
		</div>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-rail/60 px-3.5 py-2">
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-sm font-semibold text-foreground">{currentMethod.title}</span>
				{#if !currentMethod.applicable}
					<Badge variant="warning">
						<AlertTriangle class="size-3" aria-hidden="true" />
						Not Applicable
					</Badge>
				{:else if currentMethod.verifiedAgainstMna}
					<Badge variant="success">
						<ShieldCheck class="size-3" aria-hidden="true" />
						Verified vs MNA
					</Badge>
				{:else if currentMethod.verifiedAgainstMna === false}
					<Badge variant="destructive">
						<AlertTriangle class="size-3" aria-hidden="true" />
						Mismatch vs MNA
					</Badge>
				{/if}
			</div>

			{#if currentMethod.applicable && currentMethod.steps.length > 0}
				<div class="flex items-center gap-2">
					<span class="font-engineering text-[11px] text-muted-foreground">
						{currentMethod.steps.length} {currentMethod.steps.length === 1 ? 'step' : 'steps'}
					</span>
					<Button
						variant="outline"
						size="sm"
						onclick={toggleAllSteps}
						class="h-7 gap-1 px-2 text-[11px]"
					>
						{#if allExpanded}
							<ChevronsDownUp class="size-3" aria-hidden="true" />
							Collapse All
						{:else}
							<ChevronsUpDown class="size-3" aria-hidden="true" />
							Expand All
						{/if}
					</Button>
				</div>
			{/if}
		</div>

		{#if !currentMethod.applicable}
			<div
				class="flex items-start gap-2.5 rounded-md border border-warning/35 bg-warning/10 px-3.5 py-3 text-xs text-foreground"
			>
				<AlertTriangle class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
				<div class="flex flex-col gap-1">
					<span class="font-semibold text-warning">Method Not Applicable</span>
					<p class="text-muted-foreground">
						{currentMethod.inapplicableReason ??
							'This analysis method cannot be applied directly to the current circuit topology.'}
					</p>
				</div>
			</div>
		{:else if currentMethod.steps.length === 0}
			<div class="rounded-md border border-border bg-card px-3.5 py-3 text-xs text-muted-foreground">
				No derivation steps produced for this circuit.
			</div>
		{:else}
			<Accordion type="multiple" bind:value={expandedSteps}>
				{#each currentMethod.steps as step, idx (`step-${activeMethod}-${idx}`)}
					{@const itemId = `step-${activeMethod}-${idx}`}
					<AccordionItem value={itemId} title={step.title}>
						<div class="flex flex-col gap-2">
							{#if step.description}
								<p class="text-xs leading-relaxed text-muted-foreground">
									{step.description}
								</p>
							{/if}

							{#if step.snapshotNote}
								<div
									class="flex items-center gap-1.5 rounded-sm border border-border bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground"
								>
									<Info class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
									<span>{step.snapshotNote}</span>
								</div>
							{/if}

							{#if step.latex && step.latex.length > 0}
								<div class="flex flex-col gap-1 rounded-sm bg-background/60 px-2.5 py-1.5">
									{#each step.latex as eq, eqIdx (`${itemId}-eq-${eqIdx}`)}
										<MathBlock latex={eq} />
									{/each}
								</div>
							{/if}

							{#if step.matrixLatex}
								<div class="rounded-sm border border-border/70 bg-background/60 px-2.5 py-1.5">
									<MathBlock latex={step.matrixLatex} />
								</div>
							{/if}
						</div>
					</AccordionItem>
				{/each}
			</Accordion>

			{#if currentMethod.summaryLatex}
				<div class="rounded-md border border-border bg-card px-3.5 py-2.5">
					<div class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Summary
					</div>
					<MathBlock latex={currentMethod.summaryLatex} />
				</div>
			{/if}
		{/if}
	{/if}
</div>
