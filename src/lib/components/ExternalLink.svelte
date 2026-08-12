<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { cn } from '$lib/utils';

	type Props = {
		href: string;
		title?: string;
		class?: string;
		showIcon?: boolean;
		children: Snippet;
	};

	let { href, title, class: className, showIcon = true, children }: Props = $props();
</script>

<a
	{href}
	{title}
	target="_blank"
	rel="noopener noreferrer"
	class={cn(
		'group/link inline-flex min-w-0 items-center gap-0.5 truncate underline decoration-dotted underline-offset-4 transition-colors hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
		className
	)}
>
	<span class="truncate">{@render children()}</span>
	{#if showIcon}
		<ArrowUpRight
			class="size-3 shrink-0 opacity-40 transition-opacity group-hover/link:opacity-100"
		/>
	{/if}
</a>
