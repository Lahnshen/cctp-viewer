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
import { TransferIndex, type AddressMatch, type MatchRole } from './transfer-index';
import { transferId, type Transfer } from './types';

export type { AddressMatch, MatchRole };

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

class TransferStore {
	state = $state<LoadState>({ phase: 'idle' });
	transfers = $state<Transfer[]>([]);
	head = $state(0);
	deployBlock = $state(0);
	builtAt = $state<string | null>(null);
	/** False until the first tail completes, i.e. until there is current data to show. */
	hasSynced = $state(false);

	#anchors: [number, number][] = [];
	#fileAnchorCount = 0;
	#index = new TransferIndex();
	#loadPromise: Promise<void> | null = null;

	get count() {
		return this.transfers.length;
	}

	/** True while anything on screen may be missing the newest transfers. */
	get syncing() {
		return this.state.phase === 'loading' || this.state.phase === 'syncing';
	}

	/**
	 * True only for the very first sync, when there is nothing current to show.
	 * A manual refresh keeps the existing rows on screen instead of blanking
	 * them, since those are already near-current.
	 */
	get initialLoading() {
		return this.syncing && !this.hasSynced;
	}

	/** Re-scans for transfers added since the last sync. */
	async refresh() {
		if (this.syncing) return;
		await this.#tail();
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
			this.#fileAnchorCount = this.#anchors.length;
			this.deployBlock = file.deployBlock;
			this.builtAt = file.builtAt;
			for (const t of file.transfers) this.#index.add(t);
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
			// A stale index is still useful; treat it as synced so the UI stops
			// waiting on a chain we cannot reach.
			this.hasSynced = true;
			this.state = { phase: 'ready' };
			return;
		}
		if (current <= this.head) {
			this.hasSynced = true;
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

		// De-duplicate against the index *and* within this batch, so `transfers`
		// can never carry two rows with the same id even if a range is retried.
		const fresh: Transfer[] = [];
		const batch = new Set<string>();
		for (const t of found) {
			const id = transferId(t);
			if (this.#index.has(t) || batch.has(id)) continue;
			batch.add(id);
			fresh.push(t);
		}
		for (const t of fresh) this.#index.add(t);
		if (fresh.length) {
			this.transfers = [...fresh, ...this.transfers].sort(
				(a, b) => b.injBlock - a.injBlock || b.logIndex - a.logIndex
			);
		}
		this.head = current;
		// Keep exactly one live anchor on top of the build-time ones, so repeated
		// refreshes do not pile up near-identical points and skew interpolation.
		this.#anchors = [
			...this.#anchors.slice(0, this.#fileAnchorCount),
			[current, Math.floor(Date.now() / 1000)]
		];
		this.hasSynced = true;
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
		this.#index.link(funder, 'funder', t);
	}

	byInjTx(hash: string): Transfer[] {
		return this.#index.byInjTx(hash);
	}

	byNonce(nonce: string): Transfer | undefined {
		return this.#index.byNonce(nonce);
	}

	byAddress(addr: string): AddressMatch[] {
		return this.#index.byAddress(addr);
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
