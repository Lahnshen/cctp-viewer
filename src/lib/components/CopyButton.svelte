<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';

	import { cn } from '$lib/utils';

	let { value, class: className }: { value: string; class?: string } = $props();
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	async function copy(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1200);
		} catch {
			/* clipboard unavailable (insecure context) — nothing useful to do */
		}
	}
</script>

<button
	type="button"
	onclick={copy}
	aria-label={copied ? 'Copied' : 'Copy to clipboard'}
	class={cn(
		'text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded p-1.5 transition focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-0.5',
		// Touch devices have no hover, so a hover-revealed control is unreachable.
		// Always visible on small screens; hover-revealed from sm up.
		'opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
		className
	)}
	class:opacity-100={copied}
>
	{#if copied}
		<Check class="size-3.5 text-emerald-500" />
	{:else}
		<Copy class="size-3.5" />
	{/if}
</button>
