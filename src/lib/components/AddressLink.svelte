<script lang="ts">
	import { addressDisplay } from '$lib/cctp/format';
	import { shorten } from '$lib/cctp/hex';
	import { cn } from '$lib/utils';
	import CopyButton from './CopyButton.svelte';
	import ExternalLink from './ExternalLink.svelte';

	type Props = {
		value: string;
		domain: number;
		/** show the full value rather than a truncated one */
		full?: boolean;
		label?: string;
		class?: string;
	};

	let { value, domain, full = false, label, class: className = '' }: Props = $props();

	const view = $derived(addressDisplay(value, domain));
	const text = $derived(full ? view.primary : shorten(view.primary, 10, 8));
</script>

<span class={cn('inline-flex min-w-0 items-start gap-1', className)}>
	{#if view.href}
		<ExternalLink
			href={view.href}
			title={label ? `${label} — view on ${view.chain}` : `View on ${view.chain}`}
			class="font-mono text-xs sm:text-sm"
			wrap={full}
			showIcon={!full}
		>
			{text}
		</ExternalLink>
	{:else}
		<span
			class={cn('font-mono text-xs sm:text-sm', full ? 'break-all' : 'truncate')}
			title={view.primary}>{text}</span
		>
	{/if}
	<CopyButton value={view.copyable} class="mt-0.5 shrink-0" />
</span>
