<script lang="ts">
	import Loader from '@lucide/svelte/icons/loader-circle';
	import { store } from '$lib/cctp/store.svelte';
	import { cn } from '$lib/utils';

	type Props = {
		/** `bar` renders a determinate progress line, `chip` an inline label. */
		variant?: 'chip' | 'bar';
		class?: string;
	};
	let { variant = 'chip', class: className }: Props = $props();

	const label = $derived(
		store.state.phase === 'loading' ? 'Loading index' : 'Fetching latest transfers'
	);
	const pct = $derived(store.syncProgress === null ? null : Math.round(store.syncProgress * 100));
</script>

{#if store.syncing}
	{#if variant === 'bar'}
		<div class={cn('bg-muted h-0.5 w-full overflow-hidden', className)} role="progressbar" aria-label={label}>
			{#if pct === null}
				<!--
					Range not known yet, so the bar sweeps instead of filling. The
					animation is a scoped class rather than a Tailwind arbitrary value,
					because Svelte rewrites scoped @keyframes names and a utility class
					would reference the pre-rewrite name.
				-->
				<div class="bg-primary/60 sweep h-full w-1/3"></div>
			{:else}
				<div
					class="bg-primary/60 h-full transition-[width] duration-300 ease-out"
					style="width: {pct}%"
				></div>
			{/if}
		</div>
	{:else}
		<span class={cn('text-muted-foreground inline-flex items-center gap-1.5 text-xs', className)}>
			<Loader class="size-3 animate-spin" />
			{label}{pct === null ? '…' : ` · ${pct}%`}
		</span>
	{/if}
{/if}

<style>
	.sweep {
		animation: sync-sweep 1.1s ease-in-out infinite;
	}

	@keyframes sync-sweep {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(300%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sweep {
			animation: none;
			width: 100%;
			opacity: 0.5;
		}
	}
</style>
