import { USDC_DECIMALS } from './config';
import { hexToInj } from './bech32';
import { addressUrl, domain, INJECTIVE_DOMAIN, txUrl } from './domains';

/** micro-USDC → a human amount, trimming trailing zeros but keeping at least 2dp. */
/** micro-USDC → a human amount with exactly two decimals, rounded half-up. */
export function formatUsdc(raw: string | bigint): string {
	const v = typeof raw === 'bigint' ? raw : BigInt(raw || '0');
	const neg = v < 0n;
	const abs = neg ? -v : v;
	// Rounding is done in bigint so large amounts never lose precision to float.
	const step = 10n ** BigInt(USDC_DECIMALS - 2);
	const cents = (abs + step / 2n) / step;
	const whole = cents / 100n;
	const frac = (cents % 100n).toString().padStart(2, '0');
	return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}.${frac}`;
}

/**
 * Full six-decimal precision. Used where two decimals would round a real value
 * away to 0.00 — CCTP fees are routinely a fraction of a cent.
 */
export function formatUsdcExact(raw: string | bigint): string {
	const v = typeof raw === 'bigint' ? raw : BigInt(raw || '0');
	const neg = v < 0n;
	const abs = neg ? -v : v;
	const unit = 10n ** BigInt(USDC_DECIMALS);
	const frac = (abs % unit).toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '');
	const padded = frac.length < 2 ? frac.padEnd(2, '0') : frac;
	return `${neg ? '-' : ''}${(abs / unit).toLocaleString('en-US')}.${padded}`;
}

/** Rounded to whole USDC — for aggregates, where six decimals is just noise. */
export function formatUsdcCompact(raw: string | bigint): string {
	const v = typeof raw === 'bigint' ? raw : BigInt(raw || '0');
	const whole = v / 10n ** BigInt(USDC_DECIMALS);
	return Number(whole).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function formatFee(raw: string | bigint): string {
	const v = typeof raw === 'bigint' ? raw : BigInt(raw || '0');
	return v === 0n ? 'None' : `${formatUsdcExact(v)} USDC`;
}

export function speedLabel(finalityThreshold: number): 'Fast' | 'Standard' | 'Custom' {
	if (finalityThreshold <= 1000) return 'Fast';
	if (finalityThreshold >= 2000) return 'Standard';
	return 'Custom';
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 31536000],
	['month', 2592000],
	['day', 86400],
	['hour', 3600],
	['minute', 60],
	['second', 1]
];

export function relativeTime(unixSeconds: number | null | undefined): string {
	if (!unixSeconds) return '—';
	const delta = unixSeconds - Date.now() / 1000;
	const abs = Math.abs(delta);
	for (const [unit, secs] of UNITS) {
		if (abs >= secs || unit === 'second') return rtf.format(Math.round(delta / secs), unit);
	}
	return '—';
}

/** Compact form for narrow screens: `3m`, `2h`, `5d`. */
export function relativeTimeShort(unixSeconds: number | null | undefined): string {
	if (!unixSeconds) return '—';
	const secs = Math.max(0, Math.round(Date.now() / 1000 - unixSeconds));
	if (secs < 60) return `${secs}s`;
	if (secs < 3600) return `${Math.round(secs / 60)}m`;
	if (secs < 86400) return `${Math.round(secs / 3600)}h`;
	if (secs < 2592000) return `${Math.round(secs / 86400)}d`;
	if (secs < 31536000) return `${Math.round(secs / 2592000)}mo`;
	return `${Math.round(secs / 31536000)}y`;
}

export function absoluteTime(unixSeconds: number | null | undefined): string {
	if (!unixSeconds) return '—';
	return new Date(unixSeconds * 1000).toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
}

/**
 * How an address should be shown and linked for a given domain.
 *
 * Only domain 29 and other EVM domains get a 0x form; Solana, Stellar and
 * friends arrive from Iris already in their native encoding and are passed
 * through untouched rather than parsed as hex.
 */
export function addressDisplay(value: string, domainId: number) {
	const d = domain(domainId);
	const isHexAddr = /^0x[0-9a-fA-F]{40}$/.test(value);
	const inj = domainId === INJECTIVE_DOMAIN && isHexAddr ? hexToInj(value) : null;
	return {
		primary: inj ?? value,
		secondary: inj ? value : null,
		href: addressUrl(domainId, inj ?? value),
		chain: d.name,
		copyable: inj ?? value
	};
}

export function txDisplay(hash: string, domainId: number) {
	return { href: txUrl(domainId, hash), chain: domain(domainId).name };
}
