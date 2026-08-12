<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Search from '@lucide/svelte/icons/search';

	import AddressLink from './AddressLink.svelte';
	import ChainBadge from './ChainBadge.svelte';
	import ExternalLink from './ExternalLink.svelte';
	import Field from './Field.svelte';
	import StatusBadge from './StatusBadge.svelte';

	import { INJECTIVE_DOMAIN, domain, txUrl } from '$lib/cctp/domains';
	import { absoluteTime, formatFee, formatUsdc, formatUsdcExact, speedLabel } from '$lib/cctp/format';
	import { attestationFor } from '$lib/cctp/iris';
	import { canResolveFunder, resolveFunder, type Funding } from '$lib/cctp/funder';
	import { shorten } from '$lib/cctp/hex';
	import { store } from '$lib/cctp/store.svelte';
	import type { Attestation, Transfer } from '$lib/cctp/types';

	type Props = { transfer: Transfer; onsearch?: (q: string) => void };
	let { transfer, onsearch }: Props = $props();

	let attestation = $state<Attestation | null>(null);
	let funding = $state<Funding | null | 'unresolved'>(null);
	let funderBusy = $state(false);

	const isDeposit = $derived(transfer.direction === 'deposit');
	const counterpartyDomain = $derived(
		isDeposit ? transfer.sourceDomain : transfer.destinationDomain
	);
	const injTime = $derived(store.timeFor(transfer.injBlock));
	/** The safe/router is only interesting when it differs from the end recipient. */
	const senderIsRouter = $derived(
		isDeposit && transfer.sender.toLowerCase() !== transfer.recipient.toLowerCase()
	);

	/**
	 * Both directions need Iris, for different reasons: a withdrawal for its
	 * attestation status, a deposit for the source-chain tx hash, which is the
	 * one thing the Injective log cannot tell us.
	 */
	$effect(() => {
		const t = transfer;
		let cancelled = false;
		attestation = null;
		funding = t.funder ? { from: t.funder, amount: 0n, txHash: '', block: 0 } : null;
		attestationFor(t).then((a) => {
			if (!cancelled) attestation = a;
		});
		return () => {
			cancelled = true;
		};
	});

	async function lookUpFunder() {
		if (!isDeposit || funderBusy) return;
		funderBusy = true;
		try {
			let hash = attestation?.sourceTxHash;
			if (!hash) {
				const a = await attestationFor(transfer);
				attestation = a;
				hash = a.sourceTxHash;
			}
			if (!hash) {
				funding = 'unresolved';
				return;
			}
			const found = await resolveFunder(transfer.sourceDomain, transfer.sender, hash);
			if (found) store.rememberFunder(transfer, found.from);
			funding = found ?? 'unresolved';
		} catch {
			funding = 'unresolved';
		} finally {
			funderBusy = false;
		}
	}

</script>

<Card.Root class="overflow-hidden">
	<Card.Header class="gap-2">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-baseline gap-2">
				<span class="text-2xl font-semibold tabular-nums">{formatUsdc(transfer.amount)}</span>
				<span class="text-muted-foreground text-sm font-medium">USDC</span>
			</div>
			<div class="flex items-center gap-1.5">
				<StatusBadge {transfer} {attestation} />
				<span
					class="bg-secondary text-secondary-foreground rounded-md px-1.5 py-0.5 text-xs font-medium"
					title={`minFinalityThreshold ${transfer.finalityThreshold} — 1000 is Fast, 2000 is Standard`}
				>
					{speedLabel(transfer.finalityThreshold)}
				</span>
				{#if transfer.hasHook}
					<span class="bg-secondary text-secondary-foreground rounded-md px-1.5 py-0.5 text-xs font-medium" title="Carries a destination hook payload">
						Hook
					</span>
				{/if}
			</div>
		</div>
		<div class="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
			<ChainBadge id={transfer.sourceDomain} />
			<span aria-hidden="true">→</span>
			<ChainBadge id={transfer.destinationDomain} />
			<span class="text-xs">·</span>
			<span class="text-xs" title={injTime ? absoluteTime(injTime) : undefined}>
				{injTime ? absoluteTime(injTime) : `block ${transfer.injBlock.toLocaleString()}`}
			</span>
		</div>
	</Card.Header>

	<Separator />

	<Card.Content class="grid gap-x-8 gap-y-4 pt-6 sm:grid-cols-2">
		<Field label={isDeposit ? 'Sent from' : 'Sent by'} hint={senderIsRouter ? 'Safe / router that called depositForBurn' : undefined}>
			<AddressLink value={transfer.sender} domain={isDeposit ? transfer.sourceDomain : INJECTIVE_DOMAIN} full />
			{#if senderIsRouter}
				<p class="text-muted-foreground mt-1 text-xs">
					This is the contract that burned the USDC, not necessarily the wallet that paid for it.
				</p>
			{/if}
		</Field>

		<Field label="Received by" hint={isDeposit ? 'Final owner of the minted USDC' : undefined}>
			<AddressLink
				value={transfer.recipient}
				domain={isDeposit ? INJECTIVE_DOMAIN : transfer.destinationDomain}
				full
			/>
		</Field>

		<Field label="Injective transaction">
			{#if txUrl(INJECTIVE_DOMAIN, transfer.injTxHash)}
				<ExternalLink href={txUrl(INJECTIVE_DOMAIN, transfer.injTxHash)!} class="font-mono text-sm">
					{shorten(transfer.injTxHash, 14, 10)}
				</ExternalLink>
			{/if}
			<p class="text-muted-foreground mt-1 text-xs">
				Block {transfer.injBlock.toLocaleString()} · log {transfer.logIndex}
			</p>
		</Field>

		<Field label={`${domain(counterpartyDomain).name} transaction`}>
			{#if !isDeposit}
				<span class="text-muted-foreground text-sm">
					Minted by the recipient or a relayer — not tracked here.
				</span>
			{:else if !attestation}
				<Skeleton class="h-5 w-44" />
			{:else if attestation.sourceTxHash}
				{@const href = txUrl(transfer.sourceDomain, attestation.sourceTxHash)}
				{#if href}
					<ExternalLink {href} class="font-mono text-sm">
						{shorten(attestation.sourceTxHash, 14, 10)}
					</ExternalLink>
				{:else}
					<span class="font-mono text-sm break-all">{attestation.sourceTxHash}</span>
				{/if}
			{:else}
				<span class="text-muted-foreground text-sm">Not reported by Circle</span>
			{/if}
		</Field>

		{#if isDeposit && senderIsRouter}
			<Field label="Funded by" hint="Wallet that paid into the safe, one transaction earlier">
				{#if funding && funding !== 'unresolved'}
					{@const paid = funding}
					<AddressLink value={paid.from} domain={transfer.sourceDomain} full />
					{#if paid.amount > 0n}
						<p class="text-muted-foreground mt-1 text-xs">
							Paid {formatUsdc(paid.amount)} USDC in
							{#if txUrl(transfer.sourceDomain, paid.txHash)}
								<ExternalLink href={txUrl(transfer.sourceDomain, paid.txHash)!} showIcon={false} class="font-mono">
									{shorten(paid.txHash, 8, 6)}
								</ExternalLink>
							{/if}
						</p>
					{/if}
					{#if onsearch}
						<Button
							variant="ghost"
							size="sm"
							class="mt-1 -ml-2 h-7 text-xs"
							onclick={() => onsearch(paid.from)}
						>
							<Search class="size-3" /> Find their other transfers
						</Button>
					{/if}
				{:else if funding === 'unresolved'}
					<span class="text-muted-foreground text-sm">
						No USDC payment into this safe in the 30,000 blocks before the burn.
					</span>
				{:else if canResolveFunder(transfer.sourceDomain)}
					<Button variant="outline" size="sm" class="h-7 text-xs" onclick={lookUpFunder} disabled={funderBusy}>
						<Wallet class="size-3" />
						{funderBusy ? 'Searching…' : `Look up on ${domain(transfer.sourceDomain).name}`}
					</Button>
					<p class="text-muted-foreground mt-1 text-xs">
						The funding transfer is a separate transaction and is not part of the CCTP message.
					</p>
				{:else}
					<span class="text-muted-foreground text-sm">
						No public RPC configured for {domain(transfer.sourceDomain).name}.
					</span>
				{/if}
			</Field>
		{/if}

		<Field label="Fee">
			<span class="text-sm tabular-nums">{formatFee(transfer.feeExecuted)}</span>
			{#if BigInt(transfer.maxFee) > 0n}
				<p class="text-muted-foreground mt-1 text-xs">
					Max {formatUsdcExact(transfer.maxFee)} USDC
				</p>
			{/if}
		</Field>

		<Field label="Nonce">
			{#if transfer.nonce}
				<span class="font-mono text-xs break-all">{transfer.nonce}</span>
			{:else}
				<span class="text-muted-foreground text-sm">
					Assigned by Circle after attestation
					<span class="block text-xs">CCTP V2 emits an empty nonce on-chain.</span>
				</span>
			{/if}
		</Field>

		{#if attestation?.delayReason}
			<Field label="Delay reason">
				<span class="text-destructive text-sm">{attestation.delayReason}</span>
			</Field>
		{/if}
	</Card.Content>
</Card.Root>
