/**
 * Loads the static index, tails Injective for anything newer, and answers
 * searches out of in-memory maps.
 *
 * The static index exists because Injective caps eth_getLogs at 10k blocks:
 * sweeping the ~20M blocks since CCTP launched takes ~2 minutes, which is fine
 * at build time and unusable at search time.
 */
import { INJECTIVE_RPC, MAX_LOG_RANGE } from './config';
import { blockNumber, pool, withRetry } from './rpc';
import { chunks, scanRange } from './scan';
import { transferId, type Transfer } from './types';

export type IndexFile = {
	version: 1;
	head: number;
	deployBlock: number;
	builtAt: string;
	anchors: [number, number][];
	transfers: Transfer[];
};

export type LoadState =
	| { phase: 'idle' }
	| { phase: 'loading' }
	/** Index is on screen but newer blocks are still being fetched. `total: 0` means the range is not known yet. */
	| { phase: 'syncing'; done: number; total: number }
	| { phase: 'ready' }
	| { phase: 'error'; message: string };

/** Roles an address can play in a transfer, used to explain why a row matched. */
export type MatchRole = 'recipient' | 'sender' | 'funder';

export type AddressMatch = { transfer: Transfer; roles: MatchRole[] };

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
	const arr = map.get(key);
	if (arr) arr.push(value);
	else map.set(key, [value]);
}

class TransferStore {
	state = $state<LoadState>({ phase: 'idle' });
	transfers = $state<Transfer[]>([]);
	head = $state(0);
	deployBlock = $state(0);
	builtAt = $state<string | null>(null);

	#anchors: [number, number][] = [];
	#byInjTx = new Map<string, Transfer[]>();
	#byNonce = new Map<string, Transfer>();
	#byAddress = new Map<string, Map<Transfer, Set<MatchRole>>>();
	#seen = new Set<string>();
	#loadPromise: Promise<void> | null = null;

	get count() {
		return this.transfers.length;
	}

	/** True while anything on screen may be missing the newest transfers. */
	get syncing() {
		return this.state.phase === 'loading' || this.state.phase === 'syncing';
	}

	/** 0–1 once the block range is known, or null while it is still being determined. */
	get syncProgress(): number | null {
		const s = this.state;
		if (s.phase !== 'syncing' || s.total === 0) return null;
		return s.done / s.total;
	}

	/** Approximate wall-clock time for a block, interpolated from build-time anchors. */
	timeFor(block: number): number | null {
		const a = this.#anchors;
		if (a.length < 2) return null;
		if (block <= a[0][0]) return a[0][1];
		if (block >= a[a.length - 1][0]) {
			const [b1, t1] = a[a.length - 2];
			const [b2, t2] = a[a.length - 1];
			return Math.round(t2 + ((block - b2) * (t2 - t1)) / (b2 - b1));
		}
		let lo = 0;
		let hi = a.length - 1;
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if (a[mid][0] <= block) lo = mid;
			else hi = mid;
		}
		const [b1, t1] = a[lo];
		const [b2, t2] = a[hi];
		return Math.round(t1 + ((block - b1) * (t2 - t1)) / (b2 - b1));
	}

	#index(t: Transfer) {
		push(this.#byInjTx, t.injTxHash.toLowerCase(), t);
		this.#seen.add(transferId(t));
		// Withdrawals have no on-chain nonce; they are found by Injective tx hash.
		if (t.nonce) this.#byNonce.set(t.nonce.toLowerCase(), t);
		const add = (addr: string | undefined, role: MatchRole) => {
			if (!addr) return;
			const key = addr.toLowerCase();
			let m = this.#byAddress.get(key);
			if (!m) this.#byAddress.set(key, (m = new Map()));
			const roles = m.get(t);
			if (roles) roles.add(role);
			else m.set(t, new Set([role]));
		};
		add(t.recipient, 'recipient');
		add(t.sender, 'sender');
		add(t.funder, 'funder');
	}

	/**
	 * Idempotent, and returns the same promise to every caller so anything that
	 * needs current data — the recent list, a search — can await the tail rather
	 * than reading a half-synced index.
	 */
	load(fetchFn: typeof fetch = fetch): Promise<void> {
		return (this.#loadPromise ??= this.#load(fetchFn));
	}

	async #load(fetchFn: typeof fetch) {
		this.state = { phase: 'loading' };
		try {
			const res = await fetchFn('/cctp-index.json');
			if (!res.ok) throw new Error(`index unavailable (HTTP ${res.status})`);
			const file = (await res.json()) as IndexFile;

			this.#anchors = file.anchors ?? [];
			this.deployBlock = file.deployBlock;
			this.builtAt = file.builtAt;
			for (const t of file.transfers) this.#index(t);
			this.transfers = file.transfers;
			this.head = file.head;
			// The index is on screen now, but it was built at deploy time and the
			// newest transfers are still missing. Stay in `syncing` rather than
			// flipping to `ready` here, so the list is never presented as current
			// while the tail is still running.
			this.state = { phase: 'syncing', done: 0, total: 0 };

			await this.#tail();
		} catch (err) {
			this.state = { phase: 'error', message: err instanceof Error ? err.message : String(err) };
		}
	}

	/** Picks up transfers produced after the index was built. */
	async #tail() {
		this.state = { phase: 'syncing', done: 0, total: 0 };
		let current: number;
		try {
			current = await blockNumber(INJECTIVE_RPC);
		} catch {
			this.state = { phase: 'ready' }; // stale index is still useful
			return;
		}
		if (current <= this.head) {
			this.state = { phase: 'ready' };
			return;
		}

		const ranges = chunks(this.head + 1, current, MAX_LOG_RANGE);
		this.state = { phase: 'syncing', done: 0, total: ranges.length };
		const found: Transfer[] = [];
		await pool(
			ranges,
			10,
			async ([lo, hi]) => {
				try {
					found.push(...(await withRetry(() => scanRange(INJECTIVE_RPC, lo, hi), 2)));
				} catch {
					/* a gap in the tail is survivable; the index still covers history */
				}
			},
			(done, total) => {
				this.state = { phase: 'syncing', done, total };
			}
		);

		const fresh = found.filter((t) => !this.#seen.has(transferId(t)));
		for (const t of fresh) this.#index(t);
		if (fresh.length) {
			this.transfers = [...fresh, ...this.transfers].sort(
				(a, b) => b.injBlock - a.injBlock || b.logIndex - a.logIndex
			);
		}
		this.head = current;
		this.#anchors = [...this.#anchors, [current, Math.floor(Date.now() / 1000)]];
		this.state = { phase: 'ready' };
	}

	/**
	 * Records a funder resolved live from a source chain, so that searching for
	 * that wallet finds this transfer for the rest of the session even when the
	 * shipped index has no funder for it.
	 */
	rememberFunder(t: Transfer, funder: string) {
		if (t.funder?.toLowerCase() === funder.toLowerCase()) return;
		t.funder = funder;
		const key = funder.toLowerCase();
		let m = this.#byAddress.get(key);
		if (!m) this.#byAddress.set(key, (m = new Map()));
		const roles = m.get(t);
		if (roles) roles.add('funder');
		else m.set(t, new Set<MatchRole>(['funder']));
	}

	byInjTx(hash: string): Transfer[] {
		return this.#byInjTx.get(hash.toLowerCase()) ?? [];
	}

	byNonce(nonce: string): Transfer | undefined {
		return this.#byNonce.get(nonce.toLowerCase());
	}

	byAddress(addr: string): AddressMatch[] {
		const m = this.#byAddress.get(addr.toLowerCase());
		if (!m) return [];
		return [...m.entries()]
			.map(([transfer, roles]) => ({ transfer, roles: [...roles] }))
			.sort((a, b) => b.transfer.injBlock - a.transfer.injBlock);
	}

	/** Distinct safes/routers seen sending deposits, keyed by source domain. */
	sendersByDomain(): Map<number, Set<string>> {
		const out = new Map<number, Set<string>>();
		for (const t of this.transfers) {
			if (t.direction !== 'deposit' || !t.sender.startsWith('0x') || t.sender.length !== 42) continue;
			let s = out.get(t.sourceDomain);
			if (!s) out.set(t.sourceDomain, (s = new Set()));
			s.add(t.sender.toLowerCase());
		}
		return out;
	}

	recent(limit = 25): Transfer[] {
		return this.transfers.slice(0, limit);
	}
}

export const store = new TransferStore();
