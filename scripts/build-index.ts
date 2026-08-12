/**
 * Builds the static transfer index shipped with the site.
 *
 * Injective's RPC caps eth_getLogs at 10k blocks and saturates around 25
 * requests in flight, so a full sweep since the CCTP deployment is ~2 minutes.
 * That is fine at build time and impossible at search time, which is the whole
 * reason this file exists.
 *
 *   bun scripts/build-index.ts            # incremental (default)
 *   bun scripts/build-index.ts --full     # rebuild from the deploy block
 *   bun scripts/build-index.ts --from N   # rebuild from a specific block
 */
import { DEPLOY_BLOCK, INJECTIVE_RPC, MAX_LOG_RANGE } from '../src/lib/cctp/config';
import { blockNumber, getBlockTimestamp, pool, withRetry } from '../src/lib/cctp/rpc';
import { chunks, scanRange } from '../src/lib/cctp/scan';
import { transferId, type Transfer } from '../src/lib/cctp/types';

const OUT = new URL('../static/cctp-index.json', import.meta.url).pathname;
const CONCURRENCY = 25;
/** One (block, unix seconds) pair roughly every this many blocks. */
const ANCHOR_SPACING = 250_000;

type IndexFile = {
	version: 1;
	head: number;
	deployBlock: number;
	builtAt: string;
	/** ascending [block, unixSeconds] pairs for client-side time interpolation */
	anchors: [number, number][];
	transfers: Transfer[];
};

const args = process.argv.slice(2);
const fullRebuild = args.includes('--full');
const fromArg = args.indexOf('--from');
const explicitFrom = fromArg !== -1 ? Number(args[fromArg + 1]) : null;

let existing: IndexFile | null = null;
if (!fullRebuild && explicitFrom === null) {
	try {
		existing = JSON.parse(await Bun.file(OUT).text());
	} catch {
		existing = null;
	}
}

const head = await blockNumber(INJECTIVE_RPC);
const from = explicitFrom ?? (existing ? existing.head + 1 : DEPLOY_BLOCK);

if (from > head) {
	console.log(`Index already current at block ${head}.`);
	process.exit(0);
}

const ranges = chunks(from, head, MAX_LOG_RANGE);
console.log(
	`Scanning ${(head - from + 1).toLocaleString()} blocks (${from.toLocaleString()} → ${head.toLocaleString()}) ` +
		`in ${ranges.length} requests at concurrency ${CONCURRENCY}…`
);

const started = Date.now();
let lastLog = 0;
const batches = await pool(
	ranges,
	CONCURRENCY,
	([lo, hi]) => withRetry(() => scanRange(INJECTIVE_RPC, lo, hi)),
	(done, total) => {
		const now = Date.now();
		if (now - lastLog < 1000 && done !== total) return;
		lastLog = now;
		const pct = ((done / total) * 100).toFixed(1);
		const rate = done / ((now - started) / 1000);
		const eta = rate > 0 ? Math.round((total - done) / rate) : 0;
		process.stdout.write(`\r  ${pct}%  ${done}/${total} requests  ${rate.toFixed(1)} req/s  eta ${eta}s   `);
	}
);
process.stdout.write('\n');

const fresh = batches.flat();
console.log(`  decoded ${fresh.length} transfers in ${((Date.now() - started) / 1000).toFixed(1)}s`);

// Merge with any existing index. Keyed on tx + log index, never on nonce:
// V2 nonces are assigned by Iris, so every withdrawal reads 0x00…00 on-chain
// and nonce-keyed de-duplication collapses them all into one row.
const merged = new Map<string, Transfer>();
for (const t of existing?.transfers ?? []) merged.set(transferId(t), t);
for (const t of fresh) {
	// Preserve funder data resolved by a previous run.
	const prev = merged.get(transferId(t));
	merged.set(transferId(t), prev?.funder ? { ...t, funder: prev.funder } : t);
}
const transfers = [...merged.values()].sort(
	(a, b) => b.injBlock - a.injBlock || b.logIndex - a.logIndex
);

// Timestamp anchors: a handful of real block times, interpolated on the client.
const anchorBlocks: number[] = [];
for (let b = DEPLOY_BLOCK; b < head; b += ANCHOR_SPACING) anchorBlocks.push(b);
anchorBlocks.push(head);
const reusable = new Map(existing?.anchors ?? []);
const needed = anchorBlocks.filter((b) => !reusable.has(b));
console.log(`Fetching ${needed.length} timestamp anchors (${reusable.size} reused)…`);
const fetched = await pool(needed, 10, async (b) => {
	const ts = await withRetry(() => getBlockTimestamp(INJECTIVE_RPC, b));
	return [b, ts ?? 0] as [number, number];
});
for (const [b, ts] of fetched) if (ts) reusable.set(b, ts);
const anchors = [...reusable.entries()].sort((a, b) => a[0] - b[0]);

const out: IndexFile = {
	version: 1,
	head,
	deployBlock: DEPLOY_BLOCK,
	builtAt: new Date().toISOString(),
	anchors,
	transfers
};

await Bun.write(OUT, JSON.stringify(out));
const bytes = (await Bun.file(OUT).arrayBuffer()).byteLength;
const gz = Bun.gzipSync(new Uint8Array(await Bun.file(OUT).arrayBuffer())).byteLength;

const deposits = transfers.filter((t) => t.direction === 'deposit').length;
console.log(
	`\nWrote ${OUT}\n` +
		`  ${transfers.length.toLocaleString()} transfers (${deposits.toLocaleString()} deposits, ` +
		`${(transfers.length - deposits).toLocaleString()} withdrawals)\n` +
		`  head block ${head.toLocaleString()}, ${anchors.length} anchors\n` +
		`  ${(bytes / 1e6).toFixed(2)} MB raw / ${(gz / 1e6).toFixed(2)} MB gzipped`
);
