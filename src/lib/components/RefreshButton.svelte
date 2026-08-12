<script lang="ts">
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import { Button } from '$lib/components/ui/button';
	import { store } from '$lib/cctp/store.svelte';
	import { cn } from '$lib/utils';

	type Props = {
		/** Runs after new transfers land — used to re-run the active search. */
		onrefreshed?: () => void;
		class?: string;
	};
	let { onrefreshed, class: className }: Props = $props();

	async function refresh() {
		await store.refresh();
		onrefreshed?.();
	}
</script>

<Button
	type="button"
	variant="ghost"
	size="sm"
	class={cn('h-8 gap-1.5 px-2.5 text-xs sm:h-7 sm:px-2', className)}
	onclick={refresh}
	disabled={store.syncing}
	title={store.syncing ? 'Fetching latest transfers' : 'Check for new transfers'}
>
	<RotateCw class={cn('size-3.5', store.syncing && 'animate-spin')} />
	Refresh
</Button>
