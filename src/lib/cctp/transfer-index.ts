/**
 * Lookup maps over a set of transfers. Deliberately free of Svelte runes so the
 * indexing rules can be tested directly.
 *
 * Everything is keyed by `transferId`, never by object reference: transfers are
 * indexed as the raw objects parsed out of the index file, but the UI hands
 * back `$state` proxies wrapping those same objects. Reference identity is
 * therefore not stable, and keying on it let one transfer occupy two slots —
 * which surfaced as a duplicate `{#each}` key whenever an address matched the
 * same transfer under two roles.
 */
import { transferId, type Transfer } from './types';

export type MatchRole = 'recipient' | 'sender' | 'funder';
export type AddressMatch = { transfer: Transfer; roles: MatchRole[] };

type Entry = { transfer: Transfer; roles: Set<MatchRole> };

export class TransferIndex {
	#byId = new Map<string, Transfer>();
	#byInjTx = new Map<string, Transfer[]>();
	#byNonce = new Map<string, Transfer>();
	#byAddress = new Map<string, Map<string, Entry>>();

	get size() {
		return this.#byId.size;
	}

	has(t: Transfer): boolean {
		return this.#byId.has(transferId(t));
	}

	/** Idempotent: indexing the same transfer twice is a no-op. */
	add(t: Transfer): boolean {
		const id = transferId(t);
		if (this.#byId.has(id)) return false;
		this.#byId.set(id, t);

		const txKey = t.injTxHash.toLowerCase();
		const arr = this.#byInjTx.get(txKey);
		if (arr) arr.push(t);
		else this.#byInjTx.set(txKey, [t]);

		// Withdrawals have no on-chain nonce; they are found by Injective tx hash.
		if (t.nonce) this.#byNonce.set(t.nonce.toLowerCase(), t);

		this.link(t.recipient, 'recipient', t);
		this.link(t.sender, 'sender', t);
		this.link(t.funder, 'funder', t);
		return true;
	}

	/** Records that `addr` plays `role` in `t`, merging roles for a repeat edge. */
	link(addr: string | undefined, role: MatchRole, t: Transfer) {
		if (!addr) return;
		const key = addr.toLowerCase();
		let m = this.#byAddress.get(key);
		if (!m) this.#byAddress.set(key, (m = new Map()));
		const id = transferId(t);
		const existing = m.get(id);
		if (existing) existing.roles.add(role);
		else m.set(id, { transfer: t, roles: new Set([role]) });
	}

	byAddress(addr: string): AddressMatch[] {
		const m = this.#byAddress.get(addr.toLowerCase());
		if (!m) return [];
		return [...m.values()]
			.map(({ transfer, roles }) => ({ transfer, roles: [...roles] }))
			.sort(
				(a, b) =>
					b.transfer.injBlock - a.transfer.injBlock || b.transfer.logIndex - a.transfer.logIndex
			);
	}

	byInjTx(hash: string): Transfer[] {
		return this.#byInjTx.get(hash.toLowerCase()) ?? [];
	}

	byNonce(nonce: string): Transfer | undefined {
		return this.#byNonce.get(nonce.toLowerCase());
	}
}
