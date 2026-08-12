<script lang="ts">
	import { addressDisplay } from '$lib/cctp/format';
	import { shorten } from '$lib/cctp/hex';
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

<span class="inline-flex min-w-0 items-center gap-1 {className}">
	{#if view.href}
		<ExternalLink
			href={view.href}
			title={label ? `${label} — view on ${view.chain}` : `View on ${view.chain}`}
			class="font-mono text-sm"
		>
			{text}
		</ExternalLink>
	{:else}
		<span class="truncate font-mono text-sm" title={view.primary}>{text}</span>
	{/if}
	<CopyButton value={view.copyable} />
</span>
