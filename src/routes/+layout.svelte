<script lang="ts">
	import '@fontsource-variable/public-sans';
	import '@fontsource-variable/jetbrains-mono';
	import '../app.css';
	import 'katex/dist/katex.min.css';
	import { ModeWatcher } from 'mode-watcher';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<ModeWatcher defaultMode="light" />
{@render children()}
