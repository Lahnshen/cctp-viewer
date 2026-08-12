<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import AddressLink from './AddressLink.svelte';
	import ChainBadge from './ChainBadge.svelte';
	import ExternalLink from './ExternalLink.svelte';
	import Field from './Field.svelte';

	import { domain, txUrl } from '$lib/cctp/domains';
	import { formatFee, formatUsdc, speedLabel } from '$lib/cctp/format';
	import { shorten } from '$lib/cctp/hex';
	import type { IrisMessage } from '$lib/cctp/iris';

	type Props = { message: IrisMessage; sourceDomain: number; sourceTxHash?: string };
	let { message, sourceDomain, sourceTxHash }: Props = $props();

	const dm = $derived(message.decodedMessage);
	const body = $derived(dm?.decodedMessageBody);
	const destDomain = $derived(dm ? Number(dm.destinationDomain) : sourceDomain);
</script>

<Card.Root>
	<Card.Header class="gap-2">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-baseline gap-2">
				<span class="text-2xl font-semibold tabular-nums">
					{body ? formatUsdc(body.amount) : '—'}
				</span>
				<span class="text-muted-foreground text-sm font-medium">USDC</span>
			</div>
			<span
				class="bg-secondary text-secondary-foreground rounded-md px-1.5 py-0.5 text-xs font-medium"
			>
				{message.status === 'complete' ? 'Attested' : 'Attesting'}
			</span>
		</div>
		<div class="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
			<ChainBadge id={sourceDomain} />
			<span aria-hidden="true">→</span>
			<ChainBadge id={destDomain} />
			{#if dm}
				<span class="text-xs">· {speedLabel(Number(dm.finalityThresholdExecuted))}</span>
			{/if}
		</div>
		<p class="text-muted-foreground text-xs">
			This message does not touch Injective, so it is shown straight from Circle rather than from
			the local index.
		</p>
	</Card.Header>

	<Separator />

	<Card.Content class="grid gap-x-8 gap-y-4 pt-6 sm:grid-cols-2">
		{#if body}
			<Field label="Sent by">
				<AddressLink value={body.messageSender} domain={sourceDomain} full />
			</Field>
			<Field label="Received by">
				<AddressLink value={body.mintRecipient} domain={destDomain} full />
			</Field>
			<Field label="Fee">
				<span class="text-sm tabular-nums">{formatFee(body.feeExecuted)}</span>
			</Field>
		{/if}

		{#if sourceTxHash}
			<Field label={`${domain(sourceDomain).name} transaction`}>
				{#if txUrl(sourceDomain, sourceTxHash)}
					<ExternalLink href={txUrl(sourceDomain, sourceTxHash)!} class="font-mono text-sm">
						{shorten(sourceTxHash, 14, 10)}
					</ExternalLink>
				{:else}
					<span class="font-mono text-sm break-all">{sourceTxHash}</span>
				{/if}
			</Field>
		{/if}

		<Field label="Nonce">
			<span class="font-mono text-xs break-all">{message.eventNonce}</span>
		</Field>
	</Card.Content>
</Card.Root>
