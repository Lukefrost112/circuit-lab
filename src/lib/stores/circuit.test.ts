import { beforeEach, describe, expect, it } from 'vitest';
import { PRESETS } from '$lib/data/presets';
import { circuit } from './circuit.svelte';

beforeEach(() => {
	circuit.resetToDefault();
});

describe('circuit reactive store', () => {
	it('loads PRESETS[0] on startup with valid MNA and Thévenin solution', () => {
		expect(circuit.document.id).toBe(PRESETS[0].id);
		expect(circuit.document.components.length).toBeGreaterThan(0);
		expect(circuit.solution.mna.valid).toBe(true);
		expect(circuit.theveninTarget).toEqual({ kind: 'component', componentId: 'R3' });
		expect(circuit.solution.theveninNorton).toBeDefined();
		expect(circuit.solution.allVerified).toBe(true);
		expect(circuit.canUndo).toBe(false);
		expect(circuit.canRedo).toBe(false);
	});

	it('adds components with unique IDs and canonical labels (R1, R2, V1, C1, L1, I1, GND1, TA/TB)', () => {
		circuit.clearCircuit();
		expect(circuit.document.components).toHaveLength(0);

		const r1 = circuit.addComponent('resistor', 4, 4);
		const r2 = circuit.addComponent('resistor', 8, 4);
		const v1 = circuit.addComponent('voltage_source', 2, 6, { rotation: 90 });
		const c1 = circuit.addComponent('capacitor', 12, 6, { rotation: 90 });
		const l1 = circuit.addComponent('inductor', 16, 4);
		const i1 = circuit.addComponent('current_source', 20, 6, { rotation: 270 });
		const g1 = circuit.addComponent('ground', 2, 8);
		const ta = circuit.addComponent('terminal', 22, 4);
		const tb = circuit.addComponent('terminal', 22, 8);

		expect(r1.label).toBe('R1');
		expect(r2.label).toBe('R2');
		expect(v1.label).toBe('V1');
		expect(c1.label).toBe('C1');
		expect(l1.label).toBe('L1');
		expect(i1.label).toBe('I1');
		expect(g1.label).toBe('GND1');
		expect(ta.label).toBe('TA');
		expect(ta.terminalName).toBe('A');
		expect(tb.label).toBe('TB');
		expect(tb.terminalName).toBe('B');
		expect(circuit.selectedComponentId).toBe(tb.id);
	});

	it('moves, rotates, updates, and deletes components and wires reactively', () => {
		circuit.clearCircuit();

		const v1 = circuit.addComponent('voltage_source', 4, 6, { rotation: 90, value: '12' });
		const r1 = circuit.addComponent('resistor', 10, 6, { rotation: 90, value: '4k' });
		const gnd = circuit.addComponent('ground', 4, 8);

		// Move R1 to (8, 6)
		circuit.moveComponent(r1.id, 8, 6);
		expect(circuit.document.components.find((c) => c.id === r1.id)).toMatchObject({ x: 8, y: 6 });

		// Rotate placement & component
		expect(circuit.placementRotation).toBe(0);
		circuit.rotateComponent(); // rotates placementRotation when no id
		expect(circuit.placementRotation).toBe(90);
		circuit.rotateComponent(r1.id);
		expect(circuit.document.components.find((c) => c.id === r1.id)?.rotation).toBe(180);
		circuit.rotateComponent(r1.id);
		circuit.rotateComponent(r1.id);
		circuit.rotateComponent(r1.id);
		expect(circuit.document.components.find((c) => c.id === r1.id)?.rotation).toBe(90);

		// Connect circuit with orthogonal wires: V1(4,4)->(8,4) and (4,8)->(8,8)
		const w1 = circuit.addWire([
			{ x: 4, y: 4 },
			{ x: 8, y: 4 }
		]);
		const w2 = circuit.addWire([
			{ x: 4, y: 8 },
			{ x: 8, y: 8 }
		]);
		expect(w1).not.toBeNull();
		expect(w2).not.toBeNull();

		// Zero-length and duplicate wires are ignored
		expect(
			circuit.addWire([
				{ x: 4, y: 4 },
				{ x: 4, y: 4 }
			])
		).toBeNull();
		expect(
			circuit.addWire([
				{ x: 4, y: 4 },
				{ x: 8, y: 4 }
			])
		).toBeNull();

		// Reactive solution updates automatically
		expect(circuit.solution.mna.valid).toBe(true);
		const branchR1 = circuit.solution.mna.branches[r1.id];
		expect(branchR1.voltage.re).toBeCloseTo(12, 8);
		expect(branchR1.current.re).toBeCloseTo(0.003, 8); // 12 V / 4 kΩ = 3 mA

		// Update resistor value to 6k -> current becomes 2 mA
		circuit.updateComponent(r1.id, { value: '6k' });
		expect(circuit.solution.mna.valid).toBe(true);
		expect(circuit.solution.mna.branches[r1.id].current.re).toBeCloseTo(0.002, 8);

		// Delete selected wire
		circuit.selectWire(w1!.id);
		circuit.deleteSelected();
		expect(circuit.document.wires).toHaveLength(1);
		expect(circuit.selectedWireId).toBeNull();

		// Delete selected component
		circuit.selectComponent(v1.id);
		circuit.deleteSelected();
		expect(circuit.document.components.some((c) => c.id === v1.id)).toBe(false);
		expect(circuit.selectedComponentId).toBeNull();
		expect(gnd.id).toBe('GND1');
	});

	it('maintains undo/redo history up to 50 snapshots and reconciles Thévenin target', () => {
		const initialR3 = circuit.document.components.find((c) => c.id === 'R3')!;
		expect(initialR3.value).toBe('12k');

		circuit.updateComponent('R3', { value: '24k' });
		expect(circuit.canUndo).toBe(true);
		expect(circuit.canRedo).toBe(false);
		expect(circuit.document.components.find((c) => c.id === 'R3')?.value).toBe('24k');

		// Delete R3 -> clears theveninTarget
		circuit.selectComponent('R3');
		circuit.deleteSelected();
		expect(circuit.theveninTarget).toBeUndefined();
		expect(circuit.document.components.find((c) => c.id === 'R3')).toBeUndefined();

		// Undo deletion -> restores R3 and theveninTarget
		expect(circuit.undo()).toBe(true);
		expect(circuit.document.components.find((c) => c.id === 'R3')?.value).toBe('24k');
		expect(circuit.theveninTarget).toEqual({ kind: 'component', componentId: 'R3' });
		expect(circuit.canRedo).toBe(true);

		// Undo value edit -> back to 12k
		expect(circuit.undo()).toBe(true);
		expect(circuit.document.components.find((c) => c.id === 'R3')?.value).toBe('12k');
		expect(circuit.canUndo).toBe(false);

		// Redo value edit -> 24k
		expect(circuit.redo()).toBe(true);
		expect(circuit.document.components.find((c) => c.id === 'R3')?.value).toBe('24k');

		// Cap at 50 snapshots
		for (let i = 0; i < 60; i++) {
			circuit.updateComponent('R1', { value: `${i + 1}k` });
		}
		let undoCount = 0;
		while (circuit.undo()) {
			undoCount++;
		}
		expect(undoCount).toBe(50);
	});

	it('switches DC/AC mode, updates frequency, loads presets, and toggles Thévenin target', () => {
		const acPreset = PRESETS.find((p) => p.category === 'ac')!;
		expect(circuit.loadPreset(acPreset.id)).toBe(true);
		expect(circuit.document.mode).toBe('ac');
		expect(circuit.document.frequencyHz).toBe(acPreset.document.frequencyHz);
		expect(circuit.solution.mna.valid).toBe(true);
		expect(circuit.activeMethod).toBe(acPreset.featuredMethod);

		circuit.setFrequency(2000);
		expect(circuit.document.frequencyHz).toBe(2000);
		expect(circuit.solution.mna.frequencyHz).toBe(2000);
		expect(circuit.solution.mna.valid).toBe(true);

		circuit.setMode('dc');
		expect(circuit.document.mode).toBe('dc');
		expect(circuit.solution.mna.valid).toBe(true);

		circuit.clearTheveninTarget();
		expect(circuit.theveninTarget).toBeUndefined();
		circuit.setTheveninComponent('R1');
		expect(circuit.theveninTarget).toEqual({ kind: 'component', componentId: 'R1' });
		expect(circuit.solution.theveninNorton?.loadComponentId).toBe('R1');
	});
});
