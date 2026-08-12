/**
 * Resolves, for every safe-routed deposit, the source-chain wallet that paid
 * into the safe — and writes it into the index so it becomes a search key.
 *
 * This is the one piece of the picture that is genuinely not in the CCTP
 * message: the user funds the safe in one transaction, the safe bridges in
 * another, and only the second is a CCTP message. Recovering the first means
 * reading the source chain, which is far too slow to do per search but fine
 * once at build time.
 *
 *   bun scripts/resolve-funders.ts              # fill in whatever is missing
 *   bun scripts/resolve-funders.ts --limit 200  # partial pass
 *   bun scripts/resolve-funders.ts --redo       # recompute existing ones too
 */
import { IRIS } from '../src/lib/cctp/config';
import { canResolveFunder, resolveFunder } from '../src/lib/cctp/funder';
import { pool } from '../src/lib/cctp/rpc';
import type { Transfer } from '../src/lib/cctp/types';

const OUT = new URL('../static/cctp-index.json', import.meta.url).pathname;
const args = process.argv.slice(2);
const redo = args.includes('--redo');
const limitArg = args.indexOf('--limit');
const limit = limitArg !== -1 ? Number(args[limitArg + 1]) : Infinity;

/** Both Iris and the public source-chain RPCs are shared, so stay well under. */
const CONCURRENCY = 8;

const file = JSON.parse(await Bun.file(OUT).text()) as {
	transfers: Transfer[];
	funderPass?: { at: string; resolved: number; attempted: number };
};

const candidates = file.transfers.filter(
	(t) =>
		t.direction === 'deposit' &&
		t.nonce &&
		t.sender.toLowerCase() !== t.recipient.toLowerCase() &&
		canResolveFunder(t.sourceDomain) &&
		(redo || !t.funder)
);
const work = candidates.slice(0, limit === Infinity ? undefined : limit);

console.log(
	`${file.transfers.length} transfers indexed; ${candidates.length} safe-routed deposits need a funder` +
		(work.length !== candidates.length ? ` (doing ${work.length})` : '')
);
if (!work.length) process.exit(0);

async function sourceTxFor(t: Transfer): Promise<string | null> {
	const res = await fetch(`${IRIS}/v2/messages/${t.sourceDomain}?nonce=${t.nonce}`);
	if (!res.ok) return null;
	const json = (await res.json()) as { sourceTxHash?: string };
	return json.sourceTxHash ?? null;
}

const started = Date.now();
let resolved = 0;
let lastLog = 0;

await pool(
	work,
	CONCURRENCY,
	async (t) => {
		try {
			const hash = await sourceTxFor(t);
			if (!hash) return;
			const funding = await resolveFunder(t.sourceDomain, t.sender, hash);
			if (funding) {
				t.funder = funding.from;
				resolved++;
			}
		} catch {
			/* a source chain being unreachable should not fail the whole pass */
		}
	},
	(done, total) => {
		const now = Date.now();
		if (now - lastLog < 1000 && done !== total) return;
		lastLog = now;
		const rate = done / ((now - started) / 1000);
		process.stdout.write(
			`\r  ${((done / total) * 100).toFixed(1)}%  ${done}/${total}  ` +
				`${resolved} resolved  ${rate.toFixed(1)}/s  eta ${Math.round((total - done) / (rate || 1))}s   `
		);
	}
);
process.stdout.write('\n');

file.funderPass = {
	at: new Date().toISOString(),
	resolved: (file.funderPass?.resolved ?? 0) + resolved,
	attempted: (file.funderPass?.attempted ?? 0) + work.length
};

await Bun.write(OUT, JSON.stringify(file));
const bytes = (await Bun.file(OUT).arrayBuffer()).byteLength;
const gz = Bun.gzipSync(new Uint8Array(await Bun.file(OUT).arrayBuffer())).byteLength;
const withFunder = file.transfers.filter((t) => t.funder).length;

console.log(
	`\nResolved ${resolved}/${work.length} in ${((Date.now() - started) / 1000).toFixed(1)}s\n` +
		`  ${withFunder} transfers now carry a funder\n` +
		`  ${(bytes / 1e6).toFixed(2)} MB raw / ${(gz / 1e6).toFixed(2)} MB gzipped`
);
