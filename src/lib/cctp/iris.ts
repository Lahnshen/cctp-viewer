/**
 * Circle's attestation service. No API key, no auth header, CORS `*` — the
 * browser calls it directly. Rate limit is 40 req/s and exceeding it blocks
 * every request for five minutes, so fan-outs stay small and are cached.
 */
import { COMMON_SOURCE_DOMAINS, INJECTIVE_DOMAIN } from './domains';
import { IRIS } from './config';
import type { Attestation } from './types';

export type IrisMessage = {
	attestation: string;
	message: string;
	eventNonce: string;
	cctpVersion: number;
	status: 'pending' | 'complete';
	delayReason: string | null;
	decodedMessage?: {
		sourceDomain: string;
		destinationDomain: string;
		nonce: string;
		sender: string;
		recipient: string;
		destinationCaller: string;
		minFinalityThreshold: string;
		finalityThresholdExecuted: string;
		decodedMessageBody?: {
			burnToken: string;
			mintRecipient: string;
			amount: string;
			messageSender: string;
			maxFee: string;
			feeExecuted: string;
			expirationBlock: string;
			hookData: string | null;
		};
	};
};

export type IrisResponse = {
	messages?: IrisMessage[];
	sourceTxHash?: string;
	error?: string;
};

const cache = new Map<string, Promise<IrisResponse>>();

async function get(domain: number, query: string): Promise<IrisResponse> {
	const key = `${domain}?${query}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const p = (async () => {
		const res = await fetch(`${IRIS}/v2/messages/${domain}?${query}`);
		if (res.status === 429) throw new Error('Iris rate limit hit — try again in a few minutes.');
		return (await res.json()) as IrisResponse;
	})();
	cache.set(key, p);
	try {
		return await p;
	} catch (err) {
		cache.delete(key);
		throw err;
	}
}

export function byNonce(sourceDomain: number, nonce: string): Promise<IrisResponse> {
	return get(sourceDomain, `nonce=${nonce}`);
}

export function byTxHash(sourceDomain: number, txHash: string): Promise<IrisResponse> {
	return get(sourceDomain, `transactionHash=${txHash}`);
}

function toAttestation(res: IrisResponse, nonce?: string): Attestation {
	const msgs = res.messages ?? [];
	const m = nonce
		? msgs.find((x) => x.eventNonce?.toLowerCase() === nonce.toLowerCase()) ?? msgs[0]
		: msgs[0];
	if (!m) return { status: 'not_found' };
	return {
		status: m.status,
		sourceTxHash: res.sourceTxHash,
		delayReason: m.delayReason,
		attestation: m.attestation
	};
}

/**
 * Live attestation state for one transfer.
 *
 * Iris is only ever queried with the *source* domain and the *source* burn tx,
 * so a deposit has to be looked up by nonce — its Injective hash is the
 * destination side and returns 404.
 */
export async function attestationFor(t: {
	direction: 'deposit' | 'withdrawal';
	sourceDomain: number;
	nonce: string | null;
	injTxHash: string;
	amount: string;
	recipient: string;
}): Promise<Attestation> {
	try {
		// A deposit's Injective hash is the destination side and 404s at Iris, so
		// it must go by nonce. A withdrawal has no on-chain nonce, so it goes by
		// its Injective tx hash — which is the source hash in that direction.
		if (t.direction === 'deposit') {
			if (!t.nonce) return { status: 'not_found' };
			return toAttestation(await byNonce(t.sourceDomain, t.nonce), t.nonce);
		}
		const res = await byTxHash(INJECTIVE_DOMAIN, t.injTxHash);
		const msgs = res.messages ?? [];
		// One Injective transaction can burn more than once. Iris reports no log
		// index, so the message is identified by its contents instead.
		const m =
			msgs.length > 1
				? (msgs.find((x) => {
						const b = x.decodedMessage?.decodedMessageBody;
						return (
							b?.amount === t.amount &&
							b?.mintRecipient?.toLowerCase() === t.recipient.toLowerCase()
						);
					}) ?? msgs[0])
				: msgs[0];
		if (!m) return { status: 'not_found' };
		return {
			status: m.status,
			sourceTxHash: res.sourceTxHash ?? t.injTxHash,
			delayReason: m.delayReason,
			attestation: m.attestation
		};
	} catch {
		return { status: 'not_found' };
	}
}

/**
 * Finds a message from a source-chain tx hash when the source domain is
 * unknown, by trying the domains that actually carry Injective flow first.
 * Stops at the first hit.
 */
export async function findByUnknownDomainTx(
	txHash: string,
	signal?: AbortSignal
): Promise<{ domain: number; res: IrisResponse } | null> {
	const groups = [COMMON_SOURCE_DOMAINS.slice(0, 6), COMMON_SOURCE_DOMAINS.slice(6)];
	for (const group of groups) {
		if (signal?.aborted) return null;
		const results = await Promise.all(
			group.map(async (domain) => {
				try {
					const res = await byTxHash(domain, txHash);
					return res.messages?.length ? { domain, res } : null;
				} catch {
					return null;
				}
			})
		);
		const hit = results.find((r) => r !== null);
		if (hit) return hit;
	}
	return null;
}

export async function transferFees(src: number, dst: number) {
	const res = await fetch(`${IRIS}/v2/burn/USDC/fees/${src}/${dst}`);
	if (!res.ok) return null;
	return (await res.json()) as { finalityThreshold: number; minimumFee: number }[];
}

export async function fastBurnAllowance() {
	const res = await fetch(`${IRIS}/v2/fastBurn/USDC/allowance`);
	if (!res.ok) return null;
	return (await res.json()) as { allowance: number; lastUpdated: string };
}
