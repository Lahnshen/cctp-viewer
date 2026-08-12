<script lang="ts">
	import ArrowBigUp from '@lucide/svelte/icons/arrow-big-up';
	import ArrowBigDown from '@lucide/svelte/icons/arrow-big-down';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	import ChainBadge from './ChainBadge.svelte';
	import { formatUsdc, relativeTime, relativeTimeShort, speedLabel } from '$lib/cctp/format';
	import { store } from '$lib/cctp/store.svelte';
	import type { MatchRole } from '$lib/cctp/store.svelte';
	import type { Transfer } from '$lib/cctp/types';
	import { cn } from '$lib/utils';

	type Props = {
		transfer: Transfer;
		roles?: MatchRole[];
		expanded?: boolean;
		onclick?: () => void;
	};
	let { transfer, roles = [], expanded = false, onclick }: Props = $props();

	const isDeposit = $derived(transfer.direction === 'deposit');
	const counterparty = $derived(isDeposit ? transfer.sourceDomain : transfer.destinationDomain);
	const time = $derived(store.timeFor(transfer.injBlock));
	const ROLE_LABEL: Record<MatchRole, string> = {
		recipient: 'recipient',
		sender: 'sender',
		funder: 'funder'
	};
</script>

<button
	type="button"
	{onclick}
	aria-expanded={expanded}
	class={cn(
		'hover:bg-muted/60 flex w-full min-h-12 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-nowrap',
		expanded && 'bg-muted/60'
	)}
>
	<span
		class={cn(
			'flex size-7 shrink-0 items-center justify-center rounded-full',
			isDeposit
				? 'bg-grey-500/10 text-emerald-600 dark:text-emerald-400'
				: 'bg-grey-500/10 text-sky-600 dark:text-sky-400'
		)}
		title={isDeposit ? 'Deposit into Injective' : 'Withdrawal from Injective'}
	>
		{#if isDeposit}
			<ArrowBigDown class="size-3.5" />
		{:else}
			<ArrowBigUp class="size-3.5" />
		{/if}
	</span>

	<span class="shrink-0 text-sm font-medium tabular-nums sm:w-28">
		{formatUsdc(transfer.amount)}
	</span>

	<!--
		Chain, direction and role are what make a row legible, so they stay on
		mobile rather than being hidden. `order-last w-full` drops them onto their
		own line below the amount; from sm up they sit inline as before.
	-->
	<span
		class="order-last flex w-full min-w-0 flex-wrap items-center gap-1.5 pl-10 sm:order-none sm:w-auto sm:shrink-0 sm:pl-0"
	>
		<ChainBadge id={counterparty} />
		<span class="text-muted-foreground text-xs">{isDeposit ? 'in' : 'out'}</span>
		{#each roles as role (role)}
			<span class="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
				{ROLE_LABEL[role]}
			</span>
		{/each}
	</span>

	<span class="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
		<span class="text-muted-foreground hidden w-20 text-right text-xs lg:block">
			{speedLabel(transfer.finalityThreshold)}
		</span>

		<span class="text-muted-foreground text-right text-[0.65rem] tabular-nums">
			<span class="sm:hidden">{relativeTimeShort(time)}</span>
			<span class="hidden sm:inline">{relativeTime(time)}</span>
		</span>

		<ChevronDown
			class={cn(
				'text-muted-foreground size-4 shrink-0 transition-transform',
				expanded && 'rotate-180'
			)}
		/>
	</span>
</button>
