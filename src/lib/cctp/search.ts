/**
 * Turns whatever the user pasted into results.
 *
 * Accepted inputs, in the order they are tried:
 *   inj1…            → converted to its 0x form, then searched as an address
 *   0x + 20 bytes    → recipient / safe sender / funder
 *   0x + 32 bytes    → Injective tx hash, then CCTP nonce, then a source-chain
 *                      tx hash resolved through Iris
 *   anything else    → matched literally against non-EVM sender/recipient fields
 */
import { injToHex, hexToInj } from './bech32';
import { INJECTIVE_DOMAIN } from './domains';
import { isAddress, isTxHash, normalizeAddress, strip0x } from './hex';
import { findByUnknownDomainTx, type IrisMessage } from './iris';
import { store, type AddressMatch, type MatchRole } from './store.svelte';
import type { Transfer } from './types';

/**
 * Which chain an address actually sits on for a given role. An address is not
 * an Injective address just because the user pasted it here — a safe that
 * appears as `sender` on a deposit lives on the source chain, and rendering it
 * as inj1… would point at the wrong explorer entirely.
 */
export function domainForRole(t: Transfer, role: MatchRole): number {
	const isDeposit = t.direction === 'deposit';
	switch (role) {
		case 'recipient':
			return isDeposit ? INJECTIVE_DOMAIN : t.destinationDomain;
		case 'sender':
			return isDeposit ? t.sourceDomain : INJECTIVE_DOMAIN;
		case 'funder':
			return t.sourceDomain;
	}
}

/** Distinct chains an address was seen acting on, for explorer links. */
export function domainsForMatches(matches: AddressMatch[]): number[] {
	const seen = new Set<number>();
	for (const m of matches) for (const r of m.roles) seen.add(domainForRole(m.transfer, r));
	return [...seen].sort((a, b) => a - b);
}

export type ParsedQuery =
	| { kind: 'address'; hex: string; inj: string | null; typed: 'hex' | 'inj' }
	| { kind: 'hash'; hex: string }
	| { kind: 'literal'; value: string }
	| { kind: 'empty' };

export function parseQuery(raw: string): ParsedQuery {
	const q = raw.trim();
	if (!q) return { kind: 'empty' };

	const fromInj = injToHex(q);
	if (fromInj) return { kind: 'address', hex: fromInj, inj: q.toLowerCase(), typed: 'inj' };

	if (q.startsWith('0x') || q.startsWith('0X')) {
		if (isAddress(q)) {
			const hex = normalizeAddress(q);
			return { kind: 'address', hex, inj: hexToInj(hex), typed: 'hex' };
		}
		if (isTxHash(q)) return { kind: 'hash', hex: '0x' + strip0x(q).toLowerCase() };
	}

	// Bare hex without the 0x prefix is common when copying out of a terminal.
	if (/^[0-9a-fA-F]+$/.test(q)) {
		if (q.length === 40) {
			const hex = normalizeAddress(q);
			return { kind: 'address', hex, inj: hexToInj(hex), typed: 'hex' };
		}
		if (q.length === 64) return { kind: 'hash', hex: '0x' + q.toLowerCase() };
	}

	return { kind: 'literal', value: q };
}

export type SearchOutcome =
	| {
			kind: 'address';
			address: string;
			inj: string | null;
			matches: AddressMatch[];
	  }
	| { kind: 'transfer'; transfers: Transfer[]; via: 'injective-tx' | 'nonce' }
	| {
			kind: 'remote';
			domain: number;
			messages: IrisMessage[];
			sourceTxHash?: string;
			/** set when the message is a deposit we also hold locally */
			local?: Transfer;
	  }
	| { kind: 'none'; query: string; hint?: string };

export async function search(raw: string, signal?: AbortSignal): Promise<SearchOutcome> {
	const parsed = parseQuery(raw);

	if (parsed.kind === 'empty') return { kind: 'none', query: raw };

	if (parsed.kind === 'address') {
		return {
			kind: 'address',
			address: parsed.hex,
			inj: parsed.inj,
			matches: store.byAddress(parsed.hex)
		};
	}

	if (parsed.kind === 'literal') {
		// Non-EVM counterparties (Solana, Stellar, …) keep their native encoding.
		const needle = parsed.value.toLowerCase();
		const hits = store.transfers.filter(
			(t) => t.sender.toLowerCase() === needle || t.recipient.toLowerCase() === needle
		);
		if (hits.length) {
			return {
				kind: 'address',
				address: parsed.value,
				inj: null,
				matches: hits.map((transfer) => ({
					transfer,
					roles: (transfer.sender.toLowerCase() === needle
						? ['sender']
						: ['recipient']) as AddressMatch['roles']
				}))
			};
		}
		return {
			kind: 'none',
			query: raw,
			hint: 'Not an Injective address, a 0x address, or a 32-byte transaction hash.'
		};
	}

	// A 32-byte hash is ambiguous: it can be an Injective tx, a CCTP nonce, or a
	// source-chain burn tx. Local lookups are free, so they go first.
	const local = store.byInjTx(parsed.hex);
	if (local.length) return { kind: 'transfer', transfers: local, via: 'injective-tx' };

	const byNonce = store.byNonce(parsed.hex);
	if (byNonce) return { kind: 'transfer', transfers: [byNonce], via: 'nonce' };

	const remote = await findByUnknownDomainTx(parsed.hex, signal);
	if (remote) {
		const nonce = remote.res.messages?.[0]?.eventNonce;
		return {
			kind: 'remote',
			domain: remote.domain,
			messages: remote.res.messages ?? [],
			sourceTxHash: remote.res.sourceTxHash,
			local: nonce ? store.byNonce(nonce) : undefined
		};
	}

	return {
		kind: 'none',
		query: raw,
		hint: 'No CCTP message found. Injective transactions appear here once indexed; source-chain hashes are looked up live via Circle.'
	};
}
