<script lang="ts">
	import ArrowBigUp from '@lucide/svelte/icons/arrow-big-up';
	import ArrowBigDown from '@lucide/svelte/icons/arrow-big-down';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	import ChainBadge from './ChainBadge.svelte';
	import { INJECTIVE_DOMAIN } from '$lib/cctp/domains';
	import { addressDisplay, formatUsdc, relativeTime, speedLabel } from '$lib/cctp/format';
	import { shorten } from '$lib/cctp/hex';
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
	/** Whose address to lead with: the Injective party in either direction. */
	const injectiveParty = $derived(isDeposit ? transfer.recipient : transfer.sender);
	const injectiveLabel = $derived(
		addressDisplay(injectiveParty, INJECTIVE_DOMAIN).primary
	);

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
		'hover:bg-muted/60 flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
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

	<span class="w-28 shrink-0 text-sm font-medium tabular-nums">
		{formatUsdc(transfer.amount)}
	</span>

	<span class="hidden shrink-0 items-center gap-1.5 sm:flex">
		<ChainBadge id={counterparty} />
		<span class="text-muted-foreground text-xs">{isDeposit ? 'in' : 'out'}</span>
	</span>

	{#if roles.length}
		<span class="hidden shrink-0 gap-1 md:flex">
			{#each roles as role (role)}
				<span class="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
					{ROLE_LABEL[role]}
				</span>
			{/each}
		</span>
	{/if}

	<span class="ml-auto text-muted-foreground hidden w-20 shrink-0 text-right text-xs lg:block">
		{speedLabel(transfer.finalityThreshold)}
	</span>

	<span class="text-muted-foreground w-24 shrink-0 text-right text-[0.65rem]">
		{relativeTime(time)}
	</span>

	<ChevronDown
		class={cn('text-muted-foreground size-4 shrink-0 transition-transform', expanded && 'rotate-180')}
	/>
</button>
