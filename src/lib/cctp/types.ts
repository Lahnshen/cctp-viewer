/** Direction relative to Injective. */
export type Direction = 'deposit' | 'withdrawal';

/**
 * One CCTP transfer, as reconstructed entirely from Injective-side logs.
 * Everything here is decoded locally — no Iris call is needed to build it.
 */
export type Transfer = {
	direction: Direction;
	/**
	 * CCTP V2 nonces are assigned by Iris, not on-chain, so `MessageSent` emits
	 * an all-zero nonce. Deposits carry a real one (it is an indexed topic on
	 * `MessageReceived`); withdrawals are null until Iris is asked.
	 */
	nonce: string | null;
	sourceDomain: number;
	destinationDomain: number;
	/** micro-USDC (6 dp), as a decimal string so it survives JSON */
	amount: string;
	maxFee: string;
	feeExecuted: string;
	/** 1000 = Fast, 2000 = Standard */
	finalityThreshold: number;
	/** Injective tx that emitted the event */
	injTxHash: string;
	injBlock: number;
	/** log index within that tx; `${injTxHash}:${logIndex}` is the stable id */
	logIndex: number;
	/** unix seconds; filled in lazily for the rows we display */
	injTimestamp?: number;
	/**
	 * Who sent it on the source chain. For a deposit this is the safe / router
	 * that called depositForBurn, not necessarily the person who funded it.
	 */
	sender: string;
	/** Who receives the minted USDC on the destination chain. */
	recipient: string;
	/** Raw bytes32 forms, kept for non-EVM domains where the above is not 20 bytes. */
	senderRaw: string;
	recipientRaw: string;
	burnToken: string;
	hasHook: boolean;
	/**
	 * Source-chain address that funded `sender` before the burn. Only present
	 * for deposits sent through a safe, and only once resolved — the funding
	 * transfer is a separate transaction and is not part of the CCTP message.
	 */
	funder?: string;
};

/** `${injTxHash}:${logIndex}` — unique even though V2 nonces are zero on-chain. */
export function transferId(t: Pick<Transfer, 'injTxHash' | 'logIndex'>): string {
	return `${t.injTxHash}:${t.logIndex}`;
}

/** Live attestation state, fetched from Iris on demand. */
export type Attestation = {
	status: 'pending' | 'complete' | 'not_found';
	sourceTxHash?: string;
	delayReason?: string | null;
	attestation?: string;
};

export type IndexFile = {
	version: 1;
	/** last block included in the static index */
	head: number;
	builtAt: string;
	transfers: Transfer[];
};
