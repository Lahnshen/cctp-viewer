export const INJECTIVE_RPC = 'https://sentry.evm-rpc.injective.network';
export const IRIS = 'https://iris-api.circle.com';

/** Injective mainnet CCTP V2 contracts (domain 29). */
export const MESSAGE_TRANSMITTER = '0x81d40f21f12a8f0e3252bccb954d722d4c464b64';
export const TOKEN_MESSENGER = '0x28b5a0e9c621a5badaa536219b3a228c8168cf5d';
export const TOKEN_MINTER = '0xfd78ee919681417d192449715b2594ab58f5d002';
export const USDC = '0xa00c59ff5a080d2b954d0c75e46e22a0c371235a';

/** Block in which MessageTransmitterV2 was deployed on Injective (2026-03-17). */
export const DEPLOY_BLOCK = 158605700;

/** Injective's public RPC caps eth_getLogs at 10,000 blocks. */
export const MAX_LOG_RANGE = 10000;

export const USDC_DECIMALS = 6;

/** Source-chain RPCs, used only to resolve who funded a safe. All send CORS `*`. */
export const SOURCE_RPC: Record<number, string> = {
	0: 'https://eth.llamarpc.com',
	1: 'https://api.avax.network/ext/bc/C/rpc',
	2: 'https://mainnet.optimism.io',
	3: 'https://arb1.arbitrum.io/rpc',
	6: 'https://mainnet.base.org',
	7: 'https://polygon-rpc.com',
	10: 'https://mainnet.unichain.org',
	11: 'https://rpc.linea.build',
	17: 'https://bsc-dataseed.binance.org'
};

/** USDC address per domain, for the funder lookup. */
export const SOURCE_USDC: Record<number, string> = {
	0: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
	1: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
	2: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
	3: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
	6: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
	7: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
	10: '0x078d782b760474a361dda0af3839290b0ef57ad6',
	11: '0x176211869ca2b568f2a7d4ee941e073a821ee1ff',
	17: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'
};

export const ERC20_TRANSFER_TOPIC =
	'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
