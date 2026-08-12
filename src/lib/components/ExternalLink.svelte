<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { cn } from '$lib/utils';

	type Props = {
		href: string;
		title?: string;
		class?: string;
		showIcon?: boolean;
		/**
		 * Wrap onto multiple lines instead of truncating. Needed for full-length
		 * values — `truncate` sets white-space:nowrap, so a 42-character address
		 * is silently clipped at the edge of a narrow screen rather than wrapping.
		 */
		wrap?: boolean;
		children: Snippet;
	};

	let { href, title, class: className, showIcon = true, wrap = false, children }: Props = $props();
</script>

<a
	{href}
	{title}
	target="_blank"
	rel="noopener noreferrer"
	class={cn(
		'group/link min-w-0 items-center gap-0.5 underline decoration-dotted underline-offset-4 transition-colors hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
		wrap ? 'inline break-all' : 'inline-flex truncate',
		className
	)}
>
	<span class={wrap ? 'break-all' : 'truncate'}>{@render children()}</span>
	{#if showIcon}
		<ArrowUpRight
			class="size-3 shrink-0 opacity-40 transition-opacity group-hover/link:opacity-100"
		/>
	{/if}
</a>
