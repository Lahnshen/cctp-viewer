/** Tiny JSON-RPC client. `fetch` only — no web3 library. */

export type Log = {
	address: string;
	topics: string[];
	data: string;
	blockNumber: string;
	transactionHash: string;
	logIndex: string;
};

export type RpcError = { code: number; message: string };

let nextId = 1;

export async function rpc<T>(
	url: string,
	method: string,
	params: unknown[],
	signal?: AbortSignal
): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
		signal
	});
	if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
	const json = (await res.json()) as { result?: T; error?: RpcError };
	if (json.error) throw new Error(`${method}: ${json.error.message}`);
	return json.result as T;
}

export const toHexBlock = (n: number) => '0x' + n.toString(16);

export async function getLogs(
	url: string,
	filter: {
		address?: string | string[];
		topics?: (string | string[] | null)[];
		fromBlock: number;
		toBlock: number | 'latest';
	},
	signal?: AbortSignal
): Promise<Log[]> {
	return rpc<Log[]>(
		url,
		'eth_getLogs',
		[
			{
				...(filter.address ? { address: filter.address } : {}),
				...(filter.topics ? { topics: filter.topics } : {}),
				fromBlock: toHexBlock(filter.fromBlock),
				toBlock: filter.toBlock === 'latest' ? 'latest' : toHexBlock(filter.toBlock)
			}
		],
		signal
	);
}

export async function blockNumber(url: string, signal?: AbortSignal): Promise<number> {
	return Number(BigInt(await rpc<string>(url, 'eth_blockNumber', [], signal)));
}

export async function getBlockTimestamp(
	url: string,
	block: number,
	signal?: AbortSignal
): Promise<number | null> {
	const b = await rpc<{ timestamp: string } | null>(
		url,
		'eth_getBlockByNumber',
		[toHexBlock(block), false],
		signal
	);
	return b ? Number(BigInt(b.timestamp)) : null;
}

/**
 * Runs `task` over `items` with bounded concurrency, reporting progress.
 * Injective's RPC saturates around 25 in flight; beyond that throughput is flat.
 */
export async function pool<T, R>(
	items: T[],
	concurrency: number,
	task: (item: T, index: number) => Promise<R>,
	onDone?: (completed: number, total: number) => void
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	let completed = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		for (;;) {
			const i = cursor++;
			if (i >= items.length) return;
			results[i] = await task(items[i], i);
			onDone?.(++completed, items.length);
		}
	});
	await Promise.all(workers);
	return results;
}

/** Retries transient RPC failures with a short backoff. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
	let lastErr: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (err instanceof Error && err.name === 'AbortError') throw err;
			await new Promise((r) => setTimeout(r, 250 * 2 ** i));
		}
	}
	throw lastErr;
}
