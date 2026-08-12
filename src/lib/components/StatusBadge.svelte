<script lang="ts">
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Loader from '@lucide/svelte/icons/loader-circle';
	import Signature from '@lucide/svelte/icons/signature';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { domain } from '$lib/cctp/domains';
	import type { Attestation, Transfer } from '$lib/cctp/types';
	import { cn } from '$lib/utils';

	type Props = { transfer: Transfer; attestation?: Attestation | null; class?: string };
	let { transfer, attestation = null, class: className }: Props = $props();

	/**
	 * A deposit is only in this index because we saw MessageReceived on
	 * Injective, which is the mint itself — that is settled fact.
	 *
	 * A withdrawal is the opposite: we saw the burn leave Injective, and Iris
	 * tells us whether it has been signed. Whether anyone then submitted
	 * receiveMessage on the destination is not something this app observes, so
	 * it never claims the funds arrived.
	 */
	const view = $derived.by(() => {
		if (transfer.direction === 'deposit') {
			return {
				label: 'Minted',
				tone: 'ok' as const,
				icon: CircleCheck,
				title: 'USDC was minted on Injective — this row is built from the mint event itself.'
			};
		}
		if (!attestation) {
			return { label: 'Checking…', tone: 'idle' as const, icon: Loader, title: 'Asking Circle for the attestation status.' };
		}
		if (attestation.status === 'pending') {
			return {
				label: 'Attesting',
				tone: 'pending' as const,
				icon: Loader,
				title: attestation.delayReason
					? `Circle has not signed this yet. Delay reason: ${attestation.delayReason}`
					: 'Burned on Injective, waiting on Circle to sign the attestation.'
			};
		}
		if (attestation.status === 'complete') {
			return {
				label: 'Attested',
				tone: 'ok' as const,
				icon: Signature,
				title: `Circle has signed this message. The mint on ${domain(transfer.destinationDomain).name} is submitted by the recipient or a relayer and is not tracked here.`
			};
		}
		return {
			label: 'Unknown',
			tone: 'warn' as const,
			icon: TriangleAlert,
			title: 'Circle returned no message for this burn.'
		};
	});

	const tones = {
		ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20',
		pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20',
		warn: 'bg-destructive/10 text-destructive ring-destructive/20',
		idle: 'bg-muted text-muted-foreground ring-border'
	};
</script>

<span
	class={cn(
		'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
		tones[view.tone],
		className
	)}
	title={view.title}
>
	{#key view.label}
		<view.icon class={cn('size-3', view.tone === 'pending' || view.label === 'Checking…' ? 'animate-spin' : '')} />
	{/key}
	{view.label}
</span>
