import { describe, expect, it } from 'vitest';
import {
	UNIT_SYSTEMS,
	formatEngineering,
	formatEngineeringWithSystem,
	getFixedUnitPrefix,
	parseComplexValue,
	parseEngineeringNumber
} from '../units';

describe('units', () => {
	it('parses SI prefixes and optional units', () => {
		expect(parseEngineeringNumber('10k')).toBe(10000);
		expect(parseEngineeringNumber('10K')).toBe(10000);
		expect(parseEngineeringNumber('4.7u')).toBeCloseTo(4.7e-6, 15);
		expect(parseEngineeringNumber('4.7µF')).toBeCloseTo(4.7e-6, 15);
		expect(parseEngineeringNumber('100m')).toBeCloseTo(0.1, 15);
		expect(parseEngineeringNumber('2.2M')).toBe(2.2e6);
		expect(parseEngineeringNumber('2.2MegΩ')).toBe(2.2e6);
		expect(parseEngineeringNumber('470 Ω')).toBe(470);
		expect(parseEngineeringNumber('15pF')).toBeCloseTo(15e-12, 20);
		expect(parseEngineeringNumber('33nH')).toBeCloseTo(33e-9, 18);
		expect(parseEngineeringNumber('5.5f')).toBeCloseTo(5.5e-15, 22);
		expect(parseEngineeringNumber('5.5fF')).toBeCloseTo(5.5e-15, 22);
		expect(parseEngineeringNumber('2F')).toBe(2);
		expect(parseEngineeringNumber('1.2GHz')).toBe(1.2e9);
		expect(parseEngineeringNumber('3T')).toBe(3e12);
		expect(parseEngineeringNumber('-2.5e-3')).toBeCloseTo(-0.0025, 15);
	});

	it('rejects invalid engineering numbers', () => {
		expect(parseEngineeringNumber('')).toBeNull();
		expect(parseEngineeringNumber('abc')).toBeNull();
		expect(parseEngineeringNumber('10xyz')).toBeNull();
		expect(parseEngineeringNumber(Number.NaN)).toBeNull();
	});

	it('parses polar and rectangular complex strings', () => {
		const p1 = parseComplexValue('50∠30°')!;
		expect(p1.re).toBeCloseTo(50 * Math.cos(Math.PI / 6), 12);
		expect(p1.im).toBeCloseTo(25, 12);

		const p2 = parseComplexValue('50@-30')!;
		expect(p2.re).toBeCloseTo(50 * Math.cos(Math.PI / 6), 12);
		expect(p2.im).toBeCloseTo(-25, 12);

		const r1 = parseComplexValue('30+j40')!;
		expect(r1.re).toBe(30);
		expect(r1.im).toBe(40);

		const r2 = parseComplexValue('30-40j')!;
		expect(r2.re).toBe(30);
		expect(r2.im).toBe(-40);

		const r3 = parseComplexValue('j100')!;
		expect(r3.re).toBe(0);
		expect(r3.im).toBe(100);

		const r4 = parseComplexValue('-j50')!;
		expect(r4.re).toBe(0);
		expect(r4.im).toBe(-50);

		const r5 = parseComplexValue('1e-3+j2e-3')!;
		expect(r5.re).toBeCloseTo(1e-3, 15);
		expect(r5.im).toBeCloseTo(2e-3, 15);

		const r6 = parseComplexValue('10k∠90°')!;
		expect(r6.re).toBeCloseTo(0, 9);
		expect(r6.im).toBeCloseTo(10000, 9);

		expect(parseComplexValue('j')!.im).toBe(1);
		expect(parseComplexValue('-j')!.im).toBe(-1);
		expect(parseComplexValue('invalid')).toBeNull();
	});

	it('formats engineering numbers with SI prefixes', () => {
		expect(formatEngineering(10000, 'Ω', 3)).toBe('10 kΩ');
		expect(formatEngineering(10000, '', 3)).toBe('10k');
		expect(formatEngineering(4.7e-6, 'F', 3)).toBe('4.7 µF');
		expect(formatEngineering(0.025, 'A', 3)).toBe('25 mA');
		expect(formatEngineering(0, 'V', 3)).toBe('0 V');
		expect(formatEngineering(-1500, 'W', 3)).toBe('-1.5 kW');
	});

	it('defines all four engineering unit systems and resolves fixed prefixes', () => {
		expect(Object.keys(UNIT_SYSTEMS)).toEqual(['auto', 'ohm-v-a', 'kohm-v-ma', 'mohm-v-ua']);
		expect(getFixedUnitPrefix('Ω', 'auto')).toBeNull();
		expect(getFixedUnitPrefix('A', 'auto')).toBeNull();

		expect(getFixedUnitPrefix('Ω', 'ohm-v-a')).toEqual({ symbol: '', factor: 1 });
		expect(getFixedUnitPrefix('A', 'ohm-v-a')).toEqual({ symbol: '', factor: 1 });
		expect(getFixedUnitPrefix('W', 'ohm-v-a')).toEqual({ symbol: '', factor: 1 });

		expect(getFixedUnitPrefix('Ω', 'kohm-v-ma')).toEqual({ symbol: 'k', factor: 1e3 });
		expect(getFixedUnitPrefix('V', 'kohm-v-ma')).toEqual({ symbol: '', factor: 1 });
		expect(getFixedUnitPrefix('A', 'kohm-v-ma')).toEqual({ symbol: 'm', factor: 1e-3 });
		expect(getFixedUnitPrefix('W', 'kohm-v-ma')).toEqual({ symbol: 'm', factor: 1e-3 });
		expect(getFixedUnitPrefix('VAR', 'kohm-v-ma')).toEqual({ symbol: 'm', factor: 1e-3 });
		expect(getFixedUnitPrefix('VA', 'kohm-v-ma')).toEqual({ symbol: 'm', factor: 1e-3 });

		expect(getFixedUnitPrefix('Ω', 'mohm-v-ua')).toEqual({ symbol: 'M', factor: 1e6 });
		expect(getFixedUnitPrefix('A', 'mohm-v-ua')).toEqual({ symbol: 'µ', factor: 1e-6 });
		expect(getFixedUnitPrefix('W', 'mohm-v-ua')).toEqual({ symbol: 'µ', factor: 1e-6 });

		// Unsupported units fall back to null so auto SI is used
		expect(getFixedUnitPrefix('F', 'kohm-v-ma')).toBeNull();
		expect(getFixedUnitPrefix('H', 'kohm-v-ma')).toBeNull();
		expect(getFixedUnitPrefix('Hz', 'mohm-v-ua')).toBeNull();
		expect(getFixedUnitPrefix('', 'ohm-v-a')).toBeNull();
	});

	it('formats values across auto, ohm-v-a, kohm-v-ma, and mohm-v-ua unit systems', () => {
		// auto delegates directly to formatEngineering
		expect(formatEngineeringWithSystem(1500, 'Ω', 3, 'auto')).toBe('1.5 kΩ');
		expect(formatEngineeringWithSystem(0.0025, 'A', 3, 'auto')).toBe('2.5 mA');

		// ohm-v-a (base SI)
		expect(formatEngineeringWithSystem(1500, 'Ω', 3, 'ohm-v-a')).toBe('1500 Ω');
		expect(formatEngineeringWithSystem(0.5, 'A', 3, 'ohm-v-a')).toBe('0.5 A');
		expect(formatEngineeringWithSystem(0.05, 'A', 3, 'ohm-v-a')).toBe('0.05 A');
		expect(formatEngineeringWithSystem(0.0025, 'W', 3, 'ohm-v-a')).toBe('0.0025 W');
		expect(formatEngineeringWithSystem(5e-5, 'A', 3, 'ohm-v-a')).toBe('5e-5 A');
		expect(formatEngineeringWithSystem(0, 'A', 3, 'ohm-v-a')).toBe('0 A');

		// kohm-v-ma (electronics scale)
		expect(formatEngineeringWithSystem(1500, 'Ω', 3, 'kohm-v-ma')).toBe('1.5 kΩ');
		expect(formatEngineeringWithSystem(470, 'Ω', 3, 'kohm-v-ma')).toBe('0.47 kΩ');
		expect(formatEngineeringWithSystem(2 / 3000, 'A', 3, 'kohm-v-ma')).toBe('0.667 mA');
		expect(formatEngineeringWithSystem(12, 'V', 3, 'kohm-v-ma')).toBe('12 V');
		expect(formatEngineeringWithSystem(0.015, 'W', 3, 'kohm-v-ma')).toBe('15 mW');
		expect(formatEngineeringWithSystem(-0.0042, 'VAR', 3, 'kohm-v-ma')).toBe('-4.2 mVAR');
		expect(formatEngineeringWithSystem(0.025, 'VA', 3, 'kohm-v-ma')).toBe('25 mVA');
		expect(formatEngineeringWithSystem(0, 'A', 3, 'kohm-v-ma')).toBe('0 mA');

		// mohm-v-ua (high-impedance scale)
		expect(formatEngineeringWithSystem(2.2e6, 'Ω', 3, 'mohm-v-ua')).toBe('2.2 MΩ');
		expect(formatEngineeringWithSystem(470e3, 'Ω', 3, 'mohm-v-ua')).toBe('0.47 MΩ');
		expect(formatEngineeringWithSystem(1.5e-5, 'A', 3, 'mohm-v-ua')).toBe('15 µA');
		expect(formatEngineeringWithSystem(2.5e-4, 'W', 3, 'mohm-v-ua')).toBe('250 µW');
		expect(formatEngineeringWithSystem(0, 'A', 3, 'mohm-v-ua')).toBe('0 µA');

		// Pass-through units (F, H, Hz) always use clean auto SI prefixes
		expect(formatEngineeringWithSystem(4.7e-6, 'F', 3, 'kohm-v-ma')).toBe('4.7 µF');
		expect(formatEngineeringWithSystem(100e-3, 'H', 3, 'mohm-v-ua')).toBe('100 mH');
		expect(formatEngineeringWithSystem(1000, 'Hz', 3, 'ohm-v-a')).toBe('1 kHz');
	});
});
