/**
 * Turns Injective MessageTransmitterV2 logs into Transfer records.
 *
 * Both directions come off the same contract:
 *   MessageSent     → Injective is the source  (withdrawal)
 *   MessageReceived → Injective is the destination (deposit)
 *
 * so a single eth_getLogs per block range covers everything, and no Iris call
 * is required — the full message body rides along in the log.
 */
import { INJECTIVE_DOMAIN } from './domains';
import { MESSAGE_TRANSMITTER } from './config';
import { decodeMessageReceived, decodeMessageSent, TOPIC, type BurnBody } from './message';
import { getLogs, type Log } from './rpc';
import type { Transfer } from './types';

function fromBody(
	body: BurnBody,
	base: Omit<
		Transfer,
		| 'amount'
		| 'maxFee'
		| 'feeExecuted'
		| 'sender'
		| 'recipient'
		| 'senderRaw'
		| 'recipientRaw'
		| 'burnToken'
		| 'hasHook'
	>
): Transfer {
	return {
		...base,
		amount: body.amount.toString(),
		maxFee: body.maxFee.toString(),
		feeExecuted: body.feeExecuted.toString(),
		sender: body.messageSender ?? body.messageSenderRaw,
		recipient: body.mintRecipient ?? body.mintRecipientRaw,
		senderRaw: body.messageSenderRaw,
		recipientRaw: body.mintRecipientRaw,
		burnToken: body.burnToken,
		hasHook: body.hookData !== null && body.hookData !== '0x'
	};
}

const isZeroNonce = (n: string) => /^0x0*$/.test(n);

export function logToTransfer(log: Log): Transfer | null {
	const topic0 = log.topics[0]?.toLowerCase();
	const injBlock = Number(BigInt(log.blockNumber));
	const injTxHash = log.transactionHash.toLowerCase();
	const logIndex = Number(BigInt(log.logIndex));

	if (topic0 === TOPIC.MessageReceived) {
		const m = decodeMessageReceived(log.topics, log.data);
		if (!m?.body) return null;
		return fromBody(m.body, {
			direction: 'deposit',
			nonce: isZeroNonce(m.nonce) ? null : m.nonce,
			sourceDomain: m.sourceDomain,
			destinationDomain: INJECTIVE_DOMAIN,
			finalityThreshold: m.finalityThresholdExecuted,
			injTxHash,
			injBlock,
			logIndex
		});
	}

	if (topic0 === TOPIC.MessageSent) {
		const m = decodeMessageSent(log.data);
		// Generic (non-burn) messages have no body and are not transfers.
		if (!m?.body) return null;
		return fromBody(m.body, {
			direction: 'withdrawal',
			// Always zero here — Iris assigns the real nonce after attestation.
			nonce: isZeroNonce(m.nonce) ? null : m.nonce,
			sourceDomain: m.sourceDomain,
			destinationDomain: m.destinationDomain,
			finalityThreshold: m.minFinalityThreshold,
			injTxHash,
			injBlock,
			logIndex
		});
	}

	return null;
}

export async function scanRange(
	url: string,
	fromBlock: number,
	toBlock: number | 'latest',
	signal?: AbortSignal
): Promise<Transfer[]> {
	const logs = await getLogs(
		url,
		{
			address: MESSAGE_TRANSMITTER,
			topics: [[TOPIC.MessageSent, TOPIC.MessageReceived]],
			fromBlock,
			toBlock
		},
		signal
	);
	const out: Transfer[] = [];
	for (const log of logs) {
		const t = logToTransfer(log);
		if (t) out.push(t);
	}
	return out;
}

/** Splits [from, to] into inclusive chunks no larger than `size`, newest first. */
export function chunks(from: number, to: number, size: number): [number, number][] {
	const out: [number, number][] = [];
	for (let end = to; end >= from; end -= size) {
		out.push([Math.max(from, end - size + 1), end]);
	}
	return out;
}
