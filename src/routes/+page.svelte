<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';

	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import SearchX from '@lucide/svelte/icons/search-x';
	import Info from '@lucide/svelte/icons/info';

	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import RemoteResult from '$lib/components/RemoteResult.svelte';
	import RefreshButton from '$lib/components/RefreshButton.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SyncIndicator from '$lib/components/SyncIndicator.svelte';
	import TransferDetail from '$lib/components/TransferDetail.svelte';
	import TransferRow from '$lib/components/TransferRow.svelte';

	import { INJECTIVE_DOMAIN, addressUrl, domain } from '$lib/cctp/domains';
	import { formatUsdcCompact, formatUsdcExact } from '$lib/cctp/format';
	import { domainsForMatches, search, type SearchOutcome } from '$lib/cctp/search';
	import { store, type AddressMatch } from '$lib/cctp/store.svelte';
	import { transferId, type Transfer } from '$lib/cctp/types';

	let query = $state('');
	let outcome = $state<SearchOutcome | null>(null);
	let busy = $state(false);
	let expandedId = $state<string | null>(null);
	let searchBar = $state<ReturnType<typeof SearchBar> | null>(null);
	let controller: AbortController | null = null;

	const EXAMPLES = [
		{ label: 'A safe deposit from Base', q: '0xcc5eae713b90ec1643f03ddf99eb41acbae03932cb1d763ee33ecb6f32a501d7' },
		{ label: 'The safe itself', q: '0xAd2533B8Fd8c29df88B881987476f36953671440' },
		{ label: 'Its owner on Injective', q: '0x3e97a647cd667314f23b1171aac2b64a15d1f0cc' }
	];

	const stats = $derived.by(() => {
		const t = store.transfers;
		let deposits = 0;
		let inVol = 0n;
		let outVol = 0n;
		for (const x of t) {
			if (x.direction === 'deposit') {
				deposits++;
				inVol += BigInt(x.amount);
			} else {
				outVol += BigInt(x.amount);
			}
		}
		return { total: t.length, deposits, withdrawals: t.length - deposits, inVol, outVol };
	});

	async function run(q: string, opts: { push?: boolean } = {}) {
		query = q;
		controller?.abort();
		if (!q) {
			outcome = null;
			expandedId = null;
			syncUrl('', opts.push);
			return;
		}
		controller = new AbortController();
		busy = true;
		try {
			// Wait for the tail, so a transfer from a few minutes ago is not reported
			// as missing just because the shipped index predates it.
			await store.load();
			const result = await search(q, controller.signal);
			outcome = result;
			// A single hit is what the user asked for — open it immediately.
			expandedId =
				result.kind === 'transfer' && result.transfers.length === 1
					? transferId(result.transfers[0])
					: result.kind === 'address' && result.matches.length === 1
						? transferId(result.matches[0].transfer)
						: null;
			syncUrl(q, opts.push);
		} finally {
			busy = false;
		}
	}

	function syncUrl(q: string, push = true) {
		if (!push) return;
		const url = new URL(page.url);
		if (q) url.searchParams.set('q', q);
		else url.searchParams.delete('q');
		replaceState(url, {});
	}

	function toggle(t: Transfer) {
		const id = transferId(t);
		expandedId = expandedId === id ? null : id;
	}

	onMount(async () => {
		await store.load();
		const q = page.url.searchParams.get('q');
		if (q) run(q, { push: false });
	});

	const addressMatches = $derived(
		outcome?.kind === 'address' ? outcome.matches : ([] as AddressMatch[])
	);
	const matchedDomains = $derived(domainsForMatches(addressMatches));
</script>

<svelte:head>
	<title>Injective CCTP Viewer</title>
	<meta
		name="description"
		content="Search native USDC deposits and withdrawals between Injective and every other CCTP chain, by address or transaction hash."
	/>
</svelte:head>

<div class="mx-auto min-h-svh w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
	<header class="mb-8">
		<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Injective CCTP Viewer</h1>
		<p class="text-muted-foreground mt-1.5 text-sm">
			Native USDC moving in and out of Injective over Circle's Cross-Chain Transfer Protocol.
		</p>
	</header>

	<SearchBar bind:this={searchBar} bind:value={query} {busy} onsubmit={(q) => run(q)} />

	<!-- Index status. Totals are withheld on first load for the same reason the list is. -->
	<div class="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
		{#if store.state.phase === 'error'}
			<span class="text-destructive">Index failed to load: {store.state.message}</span>
		{:else if store.initialLoading}
			<SyncIndicator />
		{:else}
			<span>{stats.total.toLocaleString()} transfers indexed</span>
			<span aria-hidden="true">·</span>
			<span title={`${formatUsdcExact(stats.inVol)} USDC`}>
				{formatUsdcCompact(stats.inVol)} USDC in
			</span>
			<span aria-hidden="true">·</span>
			<span title={`${formatUsdcExact(stats.outVol)} USDC`}>
				{formatUsdcCompact(stats.outVol)} USDC out
			</span>
			<span aria-hidden="true">·</span>
			{#if store.syncing}
				<SyncIndicator />
			{:else}
				<span>through block {store.head.toLocaleString()}</span>
			{/if}
			<RefreshButton class="-my-1 -ml-1" onrefreshed={() => query && run(query, { push: false })} />
		{/if}
	</div>

	<div class="mt-8 space-y-6">
		{#if busy && !outcome}
			<Skeleton class="h-40 w-full" />
		{:else if outcome?.kind === 'address'}
			<Card.Root>
				<Card.Header class="gap-1.5">
					<Card.Title class="text-base">
						{addressMatches.length}
						{addressMatches.length === 1 ? 'transfer' : 'transfers'}
					</Card.Title>
					<Card.Description class="space-y-1.5">
						<span class="block font-mono text-xs break-all">{outcome.address}</span>
						{#if matchedDomains.includes(INJECTIVE_DOMAIN) && outcome.inj}
							<span class="block font-mono text-xs break-all">{outcome.inj}</span>
						{/if}
						{#if matchedDomains.length}
							<span class="flex flex-wrap items-center gap-1.5 pt-0.5">
								<span class="text-xs">Seen on</span>
								{#each matchedDomains as d (d)}
									{@const href = addressUrl(d, d === INJECTIVE_DOMAIN && outcome.inj ? outcome.inj : outcome.address)}
									{#if href}
										<ExternalLink {href} class="text-xs">{domain(d).name}</ExternalLink>
									{:else}
										<span class="text-xs">{domain(d).name}</span>
									{/if}
								{/each}
							</span>
						{/if}
					</Card.Description>
				</Card.Header>
				{#if addressMatches.length}
					<Separator />
					<div class="divide-border divide-y">
						{#each addressMatches as match (transferId(match.transfer))}
							<div>
								<TransferRow
									transfer={match.transfer}
									roles={match.roles}
									expanded={expandedId === transferId(match.transfer)}
									onclick={() => toggle(match.transfer)}
								/>
								{#if expandedId === transferId(match.transfer)}
									<div class="bg-muted/30 px-3 pt-1 pb-3">
										<TransferDetail transfer={match.transfer} onsearch={(q) => run(q)} />
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<Card.Content>
						<div class="text-muted-foreground flex gap-2 text-sm">
							<Info class="mt-0.5 size-4 shrink-0" />
							<div class="space-y-2">
								<p>
									This address does not appear as a recipient, a safe sender, or a resolved funder in
									any indexed transfer.
								</p>
								<p class="text-xs">
									A wallet that only paid <em>into</em> a safe is not part of the CCTP message. Open the
									deposit and use <strong>Funded by → Look up</strong> to resolve it from the source chain.
								</p>
							</div>
						</div>
					</Card.Content>
				{/if}
			</Card.Root>
		{:else if outcome?.kind === 'transfer'}
			{#each outcome.transfers as t (transferId(t))}
				<TransferDetail transfer={t} onsearch={(q) => run(q)} />
			{/each}
			{#if outcome.transfers.length > 1}
				<p class="text-muted-foreground text-center text-xs">
					{outcome.transfers.length} CCTP messages in this transaction.
				</p>
			{/if}
		{:else if outcome?.kind === 'remote'}
			{#if outcome.local}
				<TransferDetail transfer={outcome.local} onsearch={(q) => run(q)} />
			{:else}
				{#each outcome.messages as m (m.eventNonce)}
					<RemoteResult
						message={m}
						sourceDomain={outcome.domain}
						sourceTxHash={outcome.sourceTxHash}
					/>
				{/each}
			{/if}
		{:else if outcome?.kind === 'none'}
			<Card.Root>
				<Card.Content class="flex flex-col items-center gap-3 py-12 text-center">
					<SearchX class="text-muted-foreground size-8" />
					<div>
						<p class="font-medium">No results for “{outcome.query}”</p>
						{#if outcome.hint}
							<p class="text-muted-foreground mx-auto mt-1 max-w-md text-sm">{outcome.hint}</p>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		{:else}
			<!-- Idle: recent activity -->
			<Card.Root class="overflow-hidden">
				<Card.Header class="gap-1">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<Card.Title class="text-base">Recent transfers</Card.Title>
						<SyncIndicator />
					</div>
					<Card.Description>
						{#if store.initialLoading}
							<Skeleton class="h-4 w-52" />
						{:else}
							{stats.deposits.toLocaleString()} deposits · {stats.withdrawals.toLocaleString()} withdrawals
						{/if}
					</Card.Description>
				</Card.Header>
				<Separator />
				<SyncIndicator variant="bar" />
				<!--
					The shipped index is only current as of build time, so showing it
					before the tail finishes would present hours-old transfers as the
					latest. Hold the list until the newest blocks are in.
				-->
				{#if store.initialLoading}
					<div class="space-y-2 p-3">
						{#each Array(8) as _, i (i)}
							<Skeleton class="h-10 w-full" />
						{/each}
					</div>
				{:else}
					<div class="divide-border divide-y">
						{#each store.recent(20) as t (transferId(t))}
							<div>
								<TransferRow
									transfer={t}
									expanded={expandedId === transferId(t)}
									onclick={() => toggle(t)}
								/>
								{#if expandedId === transferId(t)}
									<div class="bg-muted/30 px-3 pt-1 pb-3">
										<TransferDetail transfer={t} onsearch={(q) => run(q)} />
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</Card.Root>
		{/if}
	</div>
</div>
