/**
 * bech32 for Injective addresses.
 *
 * Injective account and contract addresses are the same 20 bytes as the EVM
 * address, encoded with hrp "inj". This is a pure re-encoding, not a key
 * derivation, so it works for any address including ones that never signed an
 * EVM transaction.
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const HRP = 'inj';

function polymod(values: number[]): number {
	let chk = 1;
	for (const v of values) {
		const b = chk >> 25;
		chk = ((chk & 0x1ffffff) << 5) ^ v;
		for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
	}
	return chk;
}

function hrpExpand(hrp: string): number[] {
	const out: number[] = [];
	for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
	out.push(0);
	for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
	return out;
}

function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | null {
	let acc = 0;
	let bits = 0;
	const out: number[] = [];
	const maxv = (1 << to) - 1;
	for (const value of data) {
		if (value < 0 || value >> from !== 0) return null;
		acc = (acc << from) | value;
		bits += from;
		while (bits >= to) {
			bits -= to;
			out.push((acc >> bits) & maxv);
		}
	}
	if (pad) {
		if (bits > 0) out.push((acc << (to - bits)) & maxv);
	} else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
		return null;
	}
	return out;
}

/** 0x-hex (20 bytes) → inj1… . Returns null if the input is not 20 bytes. */
export function hexToInj(hex: string): string | null {
	const h = (hex.startsWith('0x') ? hex.slice(2) : hex).toLowerCase();
	if (!/^[0-9a-f]{40}$/.test(h)) return null;
	const bytes: number[] = [];
	for (let i = 0; i < 40; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
	const data = convertBits(bytes, 8, 5, true);
	if (!data) return null;
	const chk = polymod([...hrpExpand(HRP), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
	let out = HRP + '1';
	for (const d of data) out += CHARSET[d];
	for (let i = 0; i < 6; i++) out += CHARSET[(chk >> (5 * (5 - i))) & 31];
	return out;
}

/**
 * inj1… → 0x-hex. Returns null on a bad checksum or on any payload that is not
 * 20 bytes, so a 32-byte Cosmos address can never be silently truncated into a
 * valid-looking EVM address.
 */
export function injToHex(addr: string): string | null {
	const s = addr.toLowerCase().trim();
	if (!s.startsWith(HRP + '1')) return null;
	const dataPart = s.slice(HRP.length + 1);
	if (dataPart.length < 6) return null;
	const data: number[] = [];
	for (const c of dataPart) {
		const idx = CHARSET.indexOf(c);
		if (idx === -1) return null;
		data.push(idx);
	}
	if (polymod([...hrpExpand(HRP), ...data]) !== 1) return null;
	const bytes = convertBits(data.slice(0, -6), 5, 8, false);
	if (!bytes || bytes.length !== 20) return null;
	return '0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isInjAddress(s: string): boolean {
	return injToHex(s) !== null;
}
