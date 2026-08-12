<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';

	let { value }: { value: string } = $props();
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
	class="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded p-0.5 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	class:opacity-100={copied}
>
	{#if copied}
		<Check class="size-3.5 text-emerald-500" />
	{:else}
		<Copy class="size-3.5" />
	{/if}
</button>
