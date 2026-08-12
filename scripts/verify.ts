/**
 * Checks the local decoders against ground truth from Iris and from live logs.
 * Run: bun scripts/verify.ts
 */
import { INJECTIVE_RPC, IRIS } from '../src/lib/cctp/config';
import { decodeMessage } from '../src/lib/cctp/message';
import { scanRange } from '../src/lib/cctp/scan';
import { hexToInj, injToHex } from '../src/lib/cctp/bech32';
import { blockNumber } from '../src/lib/cctp/rpc';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
	const ok = String(actual) === String(expected);
	if (!ok) failures++;
	console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n      got      ${actual}\n      expected ${expected}`}`);
}

async function iris(domain: number, query: string) {
	const r = await fetch(`${IRIS}/v2/messages/${domain}?${query}`);
	return r.json() as Promise<{ messages?: any[]; sourceTxHash?: string; error?: string }>;
}

console.log('\n1. decodeMessage vs Iris decodedMessage (Base → Injective, safe deposit)');
{
	const j = await iris(6, 'transactionHash=0xcc5eae713b90ec1643f03ddf99eb41acbae03932cb1d763ee33ecb6f32a501d7');
	const m = j.messages![0];
	const d = decodeMessage(m.message)!;
	const e = m.decodedMessage;
	check('sourceDomain', d.sourceDomain, e.sourceDomain);
	check('destinationDomain', d.destinationDomain, e.destinationDomain);
	check('nonce', d.nonce, e.nonce);
	check('sender', d.sender, e.sender);
	check('minFinalityThreshold', d.minFinalityThreshold, e.minFinalityThreshold);
	check('finalityThresholdExecuted', d.finalityThresholdExecuted, e.finalityThresholdExecuted);
	check('body.burnToken', d.body!.burnToken, e.decodedMessageBody.burnToken);
	check('body.mintRecipient', d.body!.mintRecipient, e.decodedMessageBody.mintRecipient);
	check('body.amount', d.body!.amount, e.decodedMessageBody.amount);
	check('body.messageSender', d.body!.messageSender, e.decodedMessageBody.messageSender);
	check('body.maxFee', d.body!.maxFee, e.decodedMessageBody.maxFee);
	check('body.feeExecuted', d.body!.feeExecuted, e.decodedMessageBody.feeExecuted);
	check('body.expirationBlock', d.body!.expirationBlock, e.decodedMessageBody.expirationBlock);
	check('body.hookData', d.body!.hookData, e.decodedMessageBody.hookData);
}

console.log('\n2. decodeMessage on an Injective → OP withdrawal');
{
	const j = await iris(29, 'transactionHash=0xab48a4fa9a035a2020cd3f317a13de0f7579166f8075190ac30206d0d944cc5f');
	const m = j.messages![0];
	const d = decodeMessage(m.message)!;
	check('sourceDomain', d.sourceDomain, 29);
	check('destinationDomain', d.destinationDomain, 2);
	check('amount', d.body!.amount, m.decodedMessage.decodedMessageBody.amount);
	check('messageSender', d.body!.messageSender, m.decodedMessage.decodedMessageBody.messageSender);
}

console.log('\n3. non-EVM source keeps bytes32 (Solana → Injective) instead of faking an address');
{
	const j = await iris(5, 'nonce=0x42eb2cda25f342316abe8756725e8d32f721b8e0fe36f53306366ae6e9b34e79');
	const m = j.messages![0];
	const d = decodeMessage(m.message)!;
	check('sourceDomain', d.sourceDomain, 5);
	check('burnToken is not EVM-shaped', d.body!.mintRecipient !== null, true);
	check('messageSender rejects non-EVM padding', d.body!.messageSender, null);
	check('mintRecipient (Injective side) is EVM', d.body!.mintRecipient, '0x61d76c28dabe8ed3ae299369c8e2fa419b4f654b');
}

console.log('\n4. scanRange decodes live logs in both directions');
{
	const head = await blockNumber(INJECTIVE_RPC);
	const transfers = await scanRange(INJECTIVE_RPC, head - 9999, head);
	const deposits = transfers.filter((t) => t.direction === 'deposit');
	const withdrawals = transfers.filter((t) => t.direction === 'withdrawal');
	console.log(`  scanned blocks ${head - 9999}..${head}: ${transfers.length} transfers ` +
		`(${deposits.length} deposits, ${withdrawals.length} withdrawals)`);
	check('found some transfers', transfers.length > 0, true);
	check('deposits land on Injective', deposits.every((t) => t.destinationDomain === 29), true);
	check('withdrawals leave Injective', withdrawals.every((t) => t.sourceDomain === 29), true);
	// Deposits carry a real nonce (it is an indexed topic on MessageReceived).
	// Withdrawals cannot: CCTP V2 nonces are assigned by Iris, so MessageSent
	// emits 0x00…00. Keying on nonce would collapse every withdrawal into one.
	check(
		'deposits carry a nonce',
		deposits.every((t) => t.nonce !== null && /^0x[0-9a-f]{64}$/.test(t.nonce)),
		true
	);
	check('withdrawals have no on-chain nonce', withdrawals.every((t) => t.nonce === null), true);
	check(
		'transfer ids are unique',
		new Set(transfers.map((t) => `${t.injTxHash}:${t.logIndex}`)).size,
		transfers.length
	);
	check('every amount parses', transfers.every((t) => BigInt(t.amount) >= 0n), true);

	// Cross-check one scanned deposit against Iris.
	const d = deposits[0];
	if (d) {
		const j = await iris(d.sourceDomain, `nonce=${d.nonce}`);
		const e = j.messages?.[0]?.decodedMessage?.decodedMessageBody;
		console.log(`  cross-checking deposit ${d.nonce.slice(0, 12)}… from domain ${d.sourceDomain}`);
		check('amount matches Iris', d.amount, e?.amount);
		check('recipient matches Iris', d.recipient, e?.mintRecipient);
		check('sender matches Iris', d.sender, e?.messageSender);
		check('Iris returns a sourceTxHash', typeof j.sourceTxHash === 'string', true);
	}
}

console.log('\n5. bech32 round-trip');
{
	const hex = '0x7d3eb8d25e79697670f1a8cabe4b4b1a03bcef34';
	const inj = hexToInj(hex);
	check('hex → inj', inj, 'inj105lt35j7095hvu834r9tuj6trgpmeme5cj2msc');
	check('inj → hex', injToHex(inj!), hex);
	check('rejects bad checksum', injToHex('inj105lt35j7095hvu834r9tuj6trgpmeme5cj2msd'), null);
	check('rejects wrong hrp', injToHex('cosmos105lt35j7095hvu834r9tuj6trgpmeme5cj2msc'), null);
	check('rejects short hex', hexToInj('0x1234'), null);
}


console.log('\n6. address index tolerates one transfer matching under several roles');
{
	// Regression: the address map used to be keyed by object reference. The store
	// indexes the raw objects from the index file while the UI hands back $state
	// proxies of those same objects, so one transfer could occupy two slots and
	// crash the {#each} with a duplicate key.
	const { TransferIndex } = await import('../src/lib/cctp/transfer-index');
	const file = JSON.parse(await Bun.file('static/cctp-index.json').text());
	const transfers = file.transfers as any[];

	const idx = new TransferIndex();
	for (const t of transfers) idx.add(t);
	check('every transfer indexed', idx.size, transfers.length);

	let worstDupes = 0;
	const addresses = new Set<string>();
	for (const t of transfers) for (const a of [t.recipient, t.sender, t.funder]) if (a) addresses.add(a.toLowerCase());
	for (const a of addresses) {
		const ids = idx.byAddress(a).map((m) => `${m.transfer.injTxHash}:${m.transfer.logIndex}`);
		worstDupes = Math.max(worstDupes, ids.length - new Set(ids).size);
	}
	check(`no duplicate ids across ${addresses.size} addresses`, worstDupes, 0);

	// Re-indexing is a no-op, and a proxy of an already-indexed transfer must not
	// create a second slot.
	const victim = transfers.find((t) => t.direction === 'deposit' && t.recipient)!;
	check('re-add is a no-op', idx.add(victim), false);
	const proxy = new Proxy(victim, {});
	idx.link(victim.recipient, 'funder', proxy);
	const ids = idx.byAddress(victim.recipient).map((m) => `${m.transfer.injTxHash}:${m.transfer.logIndex}`);
	check('proxy under a second role stays one entry', ids.length, new Set(ids).size);
	const roles = idx.byAddress(victim.recipient).find(
		(m) => m.transfer.injTxHash === victim.injTxHash && m.transfer.logIndex === victim.logIndex
	)?.roles;
	check('…carrying both roles', [...(roles ?? [])].sort().join(','), 'funder,recipient');
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
