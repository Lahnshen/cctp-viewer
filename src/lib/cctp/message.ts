/**
 * CCTP V2 wire-format decoders.
 *
 * The same fixed layout appears in three places, so one decoder covers all of
 * them: the `message` hex returned by Iris, the `MessageSent(bytes)` log on the
 * source chain, and (header-less) the body inside `MessageReceived`.
 *
 * Header — 148 bytes:
 *   0   uint32  version
 *   4   uint32  sourceDomain
 *   8   uint32  destinationDomain
 *   12  bytes32 nonce
 *   44  bytes32 sender
 *   76  bytes32 recipient
 *   108 bytes32 destinationCaller
 *   140 uint32  minFinalityThreshold
 *   144 uint32  finalityThresholdExecuted
 *   148 bytes   messageBody
 *
 * BurnMessage body — 228 bytes + hook:
 *   0   uint32   version
 *   4   bytes32  burnToken
 *   36  bytes32  mintRecipient
 *   68  uint256  amount
 *   100 bytes32  messageSender
 *   132 uint256  maxFee
 *   164 uint256  feeExecuted
 *   196 uint256  expirationBlock
 *   228 bytes    hookData
 */
import { bytes32ToAddress, sliceAt, strip0x, uintAt, numAt } from './hex';

export const HEADER_LEN = 148;
export const BURN_BODY_LEN = 228;

/** Verified against live Injective mainnet logs rather than derived from an ABI. */
export const TOPIC = {
	MessageSent: '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036',
	MessageReceived: '0xff48c13eda96b1cceacc6b9edeedc9e9db9d6226afbc30146b720c19d3addb1c',
	DepositForBurn: '0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5',
	MintAndWithdraw: '0x50c55e915134d457debfa58eb6f4342956f8b0616d51a89a3659360178e1ab63'
} as const;

export type BurnBody = {
	version: number;
	/** narrowed to 20 bytes when EVM-shaped, matching Iris */
	burnToken: string;
	burnTokenRaw: string;
	/** bytes32 as it appeared on the wire */
	mintRecipientRaw: string;
	/** 20-byte address, or null when the destination domain is not EVM */
	mintRecipient: string | null;
	amount: bigint;
	messageSenderRaw: string;
	messageSender: string | null;
	maxFee: bigint;
	feeExecuted: bigint;
	expirationBlock: bigint;
	hookData: string | null;
};

export type CctpMessage = {
	version: number;
	sourceDomain: number;
	destinationDomain: number;
	nonce: string;
	sender: string;
	senderRaw: string;
	recipient: string;
	recipientRaw: string;
	destinationCaller: string;
	minFinalityThreshold: number;
	finalityThresholdExecuted: number;
	body: BurnBody | null;
};

/**
 * Iris renders a bytes32 as a 20-byte address when the top 12 bytes are zero
 * and leaves it raw otherwise. Mirroring that keeps our output comparable.
 */
function narrow(b32: string): string {
	return bytes32ToAddress(b32) ?? b32;
}

/** Decodes a BurnMessage body. Returns null for non-burn (generic) messages. */
export function decodeBurnBody(bodyHex: string): BurnBody | null {
	const raw = strip0x(bodyHex);
	if (raw.length < BURN_BODY_LEN * 2) return null;
	const version = numAt(bodyHex, 0, 4);
	if (version !== 1) return null;
	const mintRecipientRaw = sliceAt(bodyHex, 36, 32);
	const messageSenderRaw = sliceAt(bodyHex, 100, 32);
	const burnTokenRaw = sliceAt(bodyHex, 4, 32);
	const hook = raw.slice(BURN_BODY_LEN * 2);
	return {
		version,
		burnToken: narrow(burnTokenRaw),
		burnTokenRaw,
		mintRecipientRaw,
		mintRecipient: bytes32ToAddress(mintRecipientRaw),
		amount: uintAt(bodyHex, 68, 32),
		messageSenderRaw,
		messageSender: bytes32ToAddress(messageSenderRaw),
		maxFee: uintAt(bodyHex, 132, 32),
		feeExecuted: uintAt(bodyHex, 164, 32),
		expirationBlock: uintAt(bodyHex, 196, 32),
		hookData: hook.length ? '0x' + hook : null
	};
}

/** Decodes a full CCTP message (header + body). */
export function decodeMessage(messageHex: string): CctpMessage | null {
	const raw = strip0x(messageHex);
	if (raw.length < HEADER_LEN * 2) return null;
	const senderRaw = sliceAt(messageHex, 44, 32);
	const recipientRaw = sliceAt(messageHex, 76, 32);
	return {
		version: numAt(messageHex, 0, 4),
		sourceDomain: numAt(messageHex, 4, 4),
		destinationDomain: numAt(messageHex, 8, 4),
		nonce: sliceAt(messageHex, 12, 32),
		sender: narrow(senderRaw),
		senderRaw,
		recipient: narrow(recipientRaw),
		recipientRaw,
		destinationCaller: sliceAt(messageHex, 108, 32),
		minFinalityThreshold: numAt(messageHex, 140, 4),
		finalityThresholdExecuted: numAt(messageHex, 144, 4),
		body: decodeBurnBody('0x' + raw.slice(HEADER_LEN * 2))
	};
}

/**
 * Reads a single dynamic `bytes` argument out of ABI-encoded event data.
 * `slot` is the index of the head word holding the offset.
 */
function readDynamicBytes(data: string, slot: number): string | null {
	const raw = strip0x(data);
	const offset = Number(uintAt(data, slot * 32, 32));
	if (!Number.isSafeInteger(offset) || offset * 2 + 64 > raw.length) return null;
	const len = Number(uintAt(data, offset, 32));
	if (!Number.isSafeInteger(len) || (offset + 32 + len) * 2 > raw.length) return null;
	return '0x' + raw.slice((offset + 32) * 2, (offset + 32 + len) * 2);
}

/** `MessageSent(bytes message)` — one non-indexed dynamic arg. */
export function decodeMessageSent(data: string): CctpMessage | null {
	const message = readDynamicBytes(data, 0);
	return message ? decodeMessage(message) : null;
}

/**
 * `MessageReceived(address indexed caller, uint32 sourceDomain,
 *  bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted,
 *  bytes messageBody)`
 *
 * Non-indexed data words: [sourceDomain, sender, bodyOffset].
 */
export function decodeMessageReceived(
	topics: string[],
	data: string
): {
	caller: string | null;
	nonce: string;
	finalityThresholdExecuted: number;
	sourceDomain: number;
	sender: string;
	body: BurnBody | null;
} | null {
	if (topics.length < 4) return null;
	const bodyHex = readDynamicBytes(data, 2);
	return {
		caller: bytes32ToAddress(topics[1]),
		nonce: topics[2].toLowerCase(),
		finalityThresholdExecuted: Number(BigInt(topics[3])),
		sourceDomain: Number(uintAt(data, 0, 32)),
		sender: sliceAt(data, 32, 32),
		body: bodyHex ? decodeBurnBody(bodyHex) : null
	};
}
