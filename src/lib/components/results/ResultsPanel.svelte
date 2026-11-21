<script lang="ts">
	import { AlertCircle, AlertTriangle, ChevronDown, Info, Sparkles } from 'lucide-svelte';
	import type {
		CircuitDocument,
		FullSolveResult,
		MethodId,
		ValidationDiagnostic
	} from '$lib/engine/types';
	import { cn } from '$lib/utils';
	import FinalAnswersCard from './FinalAnswersCard.svelte';
	import MethodStepsPanel from './MethodStepsPanel.svelte';
	import PhasorDiagram from './PhasorDiagram.svelte';

	type Props = {
		solution: FullSolveResult | null;
		document: CircuitDocument;
		selectedComponentId?: string | null;
		activeMethod?: MethodId;
		onSelectComponent?: (id: string) => void;
		onSelectTheveninComponent?: (id: string) => void;
		class?: string;
	};

	let {
		solution,
		document,
		selectedComponentId = null,
		activeMethod = $bindable<MethodId>('nodal'),
		onSelectComponent,
		onSelectTheveninComponent,
		class: className
	}: Props = $props();

	let phasorExpanded = $state(true);

	const diagnostics = $derived(solution?.mna.diagnostics ?? []);
	const errorDiags = $derived(diagnostics.filter((d) => d.severity === 'error'));
	const warningDiags = $derived(diagnostics.filter((d) => d.severity === 'warning'));
	const infoDiags = $derived(diagnostics.filter((d) => d.severity === 'info'));

	function handleDiagnosticClick(diag: ValidationDiagnostic) {
		const targetId = diag.componentIds?.[0];
		if (targetId) {
			onSelectComponent?.(targetId);
		}
	}
</script>

<div class={cn('flex flex-col gap-5', className)}>
	{#if !solution}
		<div
			class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/60 px-6 py-10 text-center"
		>
			<Sparkles class="size-5 text-primary" aria-hidden="true" />
			<div class="text-sm font-semibold text-foreground">Ready to Solve</div>
			<p class="max-w-sm text-xs text-muted-foreground">
				Build a circuit on the schematic canvas or load a preset to compute node voltages, branch
				currents, power conservation, and 6-method KaTeX derivations.
			</p>
		</div>
	{:else}
		<!-- Validation Diagnostics Banner -->
		{#if errorDiags.length > 0 || warningDiags.length > 0 || infoDiags.length > 0}
			<div class="flex flex-col gap-2" aria-label="Circuit Diagnostics">
				{#if errorDiags.length > 0}
					<div
						role="alert"
						class="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
					>
						<div class="mb-1 flex items-center gap-1.5 font-semibold">
							<AlertCircle class="size-4 shrink-0" aria-hidden="true" />
							Circuit Validation {errorDiags.length === 1 ? 'Error' : 'Errors'}
						</div>
						<ul class="flex flex-col gap-1 pl-5 list-disc">
							{#each errorDiags as diag, i (`err-${diag.code}-${i}`)}
								<li>
									{#if diag.componentIds?.length && onSelectComponent}
										<button
											type="button"
											onclick={() => handleDiagnosticClick(diag)}
											class="cursor-pointer text-left underline decoration-destructive/60 underline-offset-2 hover:text-destructive/80"
										>
											{diag.message}
										</button>
									{:else}
										{diag.message}
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if warningDiags.length > 0}
					<div
						class="rounded-md border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs text-warning"
					>
						<div class="mb-1 flex items-center gap-1.5 font-semibold">
							<AlertTriangle class="size-4 shrink-0" aria-hidden="true" />
							{warningDiags.length === 1 ? 'Warning' : 'Warnings'}
						</div>
						<ul class="flex flex-col gap-1 pl-5 list-disc text-foreground/90">
							{#each warningDiags as diag, i (`warn-${diag.code}-${i}`)}
								<li>{diag.message}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if infoDiags.length > 0}
					<div
						class="rounded-md border border-border bg-muted/60 px-3.5 py-2 text-xs text-muted-foreground"
					>
						<div class="flex items-start gap-2">
							<Info class="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
							<ul class="flex flex-col gap-0.5">
								{#each infoDiags as diag, i (`info-${diag.code}-${i}`)}
									<li>{diag.message}</li>
								{/each}
							</ul>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		{#if solution.mna.valid}
			<!-- 1. Direct Final Answers First -->
			<FinalAnswersCard
				{solution}
				{document}
				{selectedComponentId}
				{onSelectComponent}
				{onSelectTheveninComponent}
			/>

			<!-- 2. Interactive AC Polar Phasor Diagram (Collapsible in AC Mode) -->
			{#if solution.mna.mode === 'ac'}
				<section class="rounded-lg border border-border bg-card shadow-2xs">
					<button
						type="button"
						aria-expanded={phasorExpanded}
						onclick={() => (phasorExpanded = !phasorExpanded)}
						class="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-foreground transition-colors duration-150 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<span>AC Polar Phasor Diagram</span>
						<ChevronDown
							class={cn(
								'size-4 text-muted-foreground transition-transform duration-150',
								phasorExpanded && 'rotate-180'
							)}
							aria-hidden="true"
						/>
					</button>
					{#if phasorExpanded}
						<div class="border-t border-border p-3.5">
							<PhasorDiagram
								{solution}
								{selectedComponentId}
								{onSelectComponent}
							/>
						</div>
					{/if}
				</section>
			{/if}

			<!-- 3. Step-by-Step Review Below -->
			<MethodStepsPanel {solution} bind:activeMethod />
		{/if}
	{/if}
</div>
