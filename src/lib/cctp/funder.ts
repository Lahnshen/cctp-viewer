/**
 * Resolves who funded a safe before it bridged.
 *
 * When a deposit is routed through a safe, the CCTP message only records the
 * safe as `messageSender` — the user's own wallet paid into that safe in a
 * separate, earlier transaction that is not part of the message at all. The
 * only way to recover it is to look at the source chain directly.
 */
import { ERC20_TRANSFER_TOPIC, MAX_LOG_RANGE, SOURCE_RPC, SOURCE_USDC } from './config';
import { addressToTopic, bytes32ToAddress } from './hex';
import { getLogs, rpc } from './rpc';

export type Funding = {
	from: string;
	amount: bigint;
	txHash: string;
	block: number;
};

export function canResolveFunder(sourceDomain: number): boolean {
	return sourceDomain in SOURCE_RPC && sourceDomain in SOURCE_USDC;
}

/**
 * Looks back from the burn for USDC paid into `safe`. Bounded to a few windows
 * because the funding transfer is almost always immediately before the bridge;
 * returns null rather than scanning the chain if it is not.
 */
export async function resolveFunder(
	sourceDomain: number,
	safe: string,
	sourceTxHash: string,
	opts: { windows?: number; signal?: AbortSignal } = {}
): Promise<Funding | null> {
	const url = SOURCE_RPC[sourceDomain];
	const usdc = SOURCE_USDC[sourceDomain];
	if (!url || !usdc || !/^0x[0-9a-f]{40}$/i.test(safe)) return null;

	const receipt = await rpc<{ blockNumber: string } | null>(
		url,
		'eth_getTransactionReceipt',
		[sourceTxHash],
		opts.signal
	);
	if (!receipt) return null;
	const burnBlock = Number(BigInt(receipt.blockNumber));

	const windows = opts.windows ?? 3;
	for (let w = 0; w < windows; w++) {
		const to = burnBlock - w * MAX_LOG_RANGE;
		const from = Math.max(0, to - MAX_LOG_RANGE + 1);
		let logs;
		try {
			logs = await getLogs(
				url,
				{
					address: usdc,
					topics: [ERC20_TRANSFER_TOPIC, null, addressToTopic(safe)],
					fromBlock: from,
					toBlock: to
				},
				opts.signal
			);
		} catch {
			return null;
		}

		// Latest inbound payment at or before the burn, ignoring the burn's own
		// transfer of USDC out of the safe.
		const candidates = logs
			.map((l) => ({
				from: bytes32ToAddress(l.topics[1]),
				amount: BigInt(l.data === '0x' ? '0x0' : l.data),
				txHash: l.transactionHash.toLowerCase(),
				block: Number(BigInt(l.blockNumber))
			}))
			.filter(
				(c): c is Funding =>
					c.from !== null &&
					c.block <= burnBlock &&
					c.txHash !== sourceTxHash.toLowerCase() &&
					c.amount > 0n
			)
			.sort((a, b) => b.block - a.block);

		if (candidates.length) return candidates[0];
	}
	return null;
}
