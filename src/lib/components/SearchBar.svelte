<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import Loader from '@lucide/svelte/icons/loader-circle';
	import { Button } from '$lib/components/ui/button';
	import { parseQuery } from '$lib/cctp/search';

	type Props = {
		value: string;
		busy?: boolean;
		onsubmit: (q: string) => void;
	};
	let { value = $bindable(), busy = false, onsubmit }: Props = $props();

	let input = $state<HTMLInputElement | null>(null);

	const parsed = $derived(parseQuery(value));
	const kindHint = $derived.by(() => {
		switch (parsed.kind) {
			case 'address':
				return parsed.typed === 'inj' ? 'Injective address' : 'EVM address';
			case 'hash':
				return 'Transaction hash or nonce';
			case 'literal':
				return value.trim() ? 'Unrecognised format' : '';
			default:
				return '';
		}
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		onsubmit(value.trim());
		input?.blur();
	}

	export function focus() {
		input?.focus();
		input?.select();
	}

	// The full hint overflows a phone-width field, and an <input> placeholder
	// cannot be swapped by CSS, so pick it from a media query instead.
	let narrow = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(max-width: 639px)');
		const sync = () => (narrow = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});
	const placeholder = $derived(
		narrow ? 'Address or transaction hash' : 'Search by inj1… or 0x address, or a transaction hash'
	);
</script>

<form onsubmit={submit} class="relative">
	<Search
		class="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
	/>
	<!--
		pr-32 clears the clear+submit button group (~120px wide). Anything less and
		a long address runs underneath the buttons.
	-->
	<input
		bind:this={input}
		bind:value
		type="text"
		spellcheck="false"
		autocapitalize="off"
		autocomplete="off"
		{placeholder}
		aria-label="Search CCTP transfers"
		class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-12 w-full rounded-lg border pr-32 pl-10 text-base shadow-xs transition-shadow focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:text-sm"
	/>
	<div class="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
		{#if value}
			<Button
				type="button"
				variant="ghost"
				size="icon"
				class="size-8"
				aria-label="Clear search"
				onclick={() => {
					value = '';
					onsubmit('');
					focus();
				}}
			>
				<X class="size-4" />
			</Button>
		{/if}
		<Button type="submit" size="sm" class="h-8" disabled={busy}>
			{#if busy}
				<Loader class="size-3.5 animate-spin" />
			{/if}
			Search
		</Button>
	</div>
</form>

{#if kindHint}
	<p class="text-muted-foreground mt-1.5 px-1 text-xs">
		{kindHint}
		<!--
			Only shown for inj1 input. A 0x address is not necessarily an Injective
			one — the safe in a deposit lives on the source chain — so the app does
			not offer an inj1 rendering until it knows the address acts there.
		-->
		{#if parsed.kind === 'address' && parsed.typed === 'inj'}
			· searching as <span class="font-mono">{parsed.hex}</span>
		{/if}
	</p>
{/if}
