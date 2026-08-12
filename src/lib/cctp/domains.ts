/**
 * CCTP domain table. Domain ids are Circle's, not chain ids.
 *
 * `explorer` templates take a lowercase 0x hash / address. Domains whose
 * addresses are not 20-byte hex (Solana, Sui, Aptos, Stellar, Noble) have no
 * template — the UI renders those values as plain text, which is correct
 * because Iris already hands them back in each chain's native encoding.
 */
import { hexToInj } from './bech32';

export type Domain = {
	id: number;
	name: string;
	short: string;
	/** false for chains whose addresses are not 20-byte hex */
	evm: boolean;
	tx?: string;
	address?: string;
};

const D = (
	id: number,
	name: string,
	short: string,
	base?: string,
	evm = true,
	txPath = 'tx',
	addrPath = 'address'
): Domain => ({
	id,
	name,
	short,
	evm,
	tx: base ? `${base}/${txPath}/{h}` : undefined,
	address: base ? `${base}/${addrPath}/{h}` : undefined
});

export const DOMAINS: Record<number, Domain> = Object.fromEntries(
	[
		D(0, 'Ethereum', 'ETH', 'https://etherscan.io'),
		D(1, 'Avalanche', 'AVAX', 'https://snowtrace.io'),
		D(2, 'OP Mainnet', 'OP', 'https://optimistic.etherscan.io'),
		D(3, 'Arbitrum', 'ARB', 'https://arbiscan.io'),
		D(4, 'Noble', 'NOBLE', 'https://www.mintscan.io/noble', false, 'tx', 'address'),
		D(5, 'Solana', 'SOL', 'https://solscan.io', false, 'tx', 'account'),
		D(6, 'Base', 'BASE', 'https://basescan.org'),
		D(7, 'Polygon PoS', 'POL', 'https://polygonscan.com'),
		D(8, 'Sui', 'SUI', 'https://suiscan.xyz/mainnet', false, 'tx', 'account'),
		D(9, 'Aptos', 'APT', 'https://explorer.aptoslabs.com', false, 'txn', 'account'),
		D(10, 'Unichain', 'UNI', 'https://uniscan.xyz'),
		D(11, 'Linea', 'LINEA', 'https://lineascan.build'),
		D(12, 'Codex', 'CODEX'),
		D(13, 'Sonic', 'SONIC', 'https://sonicscan.org'),
		D(14, 'World Chain', 'WORLD', 'https://worldscan.org'),
		D(15, 'Monad', 'MONAD'),
		D(16, 'Sei', 'SEI', 'https://seitrace.com'),
		D(17, 'BNB Smart Chain', 'BNB', 'https://bscscan.com'),
		D(18, 'XDC', 'XDC'),
		D(19, 'HyperEVM', 'HYPE', 'https://hyperevmscan.io'),
		D(21, 'Ink', 'INK', 'https://explorer.inkonchain.com'),
		D(22, 'Plume', 'PLUME'),
		D(25, 'Starknet', 'STRK', undefined, false),
		D(26, 'Arc', 'ARC'),
		D(27, 'Stellar', 'XLM', 'https://stellar.expert/explorer/public', false),
		D(28, 'EDGE', 'EDGE'),
		// injscan is Injective's own explorer and covers both layers: it takes
		// bech32 accounts, and it resolves an EVM tx hash to its Cosmos hash. The
		// trailing slash is what its router expects; without it you get a redirect.
		{
			id: 29,
			name: 'Injective',
			short: 'INJ',
			evm: true,
			tx: 'https://injscan.com/transaction/{h}/',
			address: 'https://injscan.com/account/{h}/'
		},
		D(30, 'Morph', 'MORPH'),
		D(31, 'Pharos', 'PHAROS'),
		D(32, 'Cronos', 'CRO', 'https://cronoscan.com'),
		D(37, 'X Layer', 'XLAYER', 'https://www.oklink.com/xlayer')
	].map((d) => [d.id, d])
);

export const INJECTIVE_DOMAIN = 29;

export function domain(id: number): Domain {
	return DOMAINS[id] ?? { id, name: `Domain ${id}`, short: `#${id}`, evm: true };
}

/** Domains that account for essentially all Injective flow — tried first when fanning out to Iris. */
export const COMMON_SOURCE_DOMAINS = [6, 0, 3, 2, 7, 1, 5, 10, 11, 13, 16, 17, 19];

export function txUrl(domainId: number, hash: string): string | undefined {
	const t = domain(domainId).tx;
	return t ? t.replace('{h}', hash) : undefined;
}

export function addressUrl(domainId: number, addr: string): string | undefined {
	const t = domain(domainId).address;
	if (!t) return undefined;
	// injscan resolves accounts by bech32, not by the 0x form, so normalise here
	// rather than relying on every caller to have converted first.
	const value =
		domainId === INJECTIVE_DOMAIN && /^0x[0-9a-fA-F]{40}$/.test(addr)
			? (hexToInj(addr) ?? addr)
			: addr;
	return t.replace('{h}', value);
}
