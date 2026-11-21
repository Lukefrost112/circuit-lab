/**
 * JSON Export / Import, AI Netlist Prompt & Parser for Circuit Lab.
 */

import { layoutNetlistToDocument, type LayoutNetlistElement } from './auto-layout';
import { buildElectricalGraph, parsePassiveValue, parseSourceValue } from './graph';
import type {
	AcMagnitudeMode,
	AnalysisMode,
	CircuitComponent,
	CircuitDocument,
	CircuitWire,
	ComponentKind,
	ConstraintKind,
	Rotation
} from './types';
import { parseComplexValue, parseEngineeringNumber } from './units';

export const AI_CIRCUIT_IMPORT_PROMPT = `Convert the attached circuit diagram into a single valid JSON object for Circuit Lab.
Output ONLY raw JSON (no markdown commentary, no explanation outside the JSON).

Schema:
{
  "schemaVersion": 1,
  "name": "Short descriptive circuit name",
  "mode": "dc" | "ac",
  "frequencyHz": 60,
  "acMagnitudeMode": "rms",
  "elements": [
    {
      "id": "R1",
      "kind": "resistor" | "capacitor" | "inductor" | "voltage_source" | "current_source",
      "label": "R1",
      "from": "N1",
      "to": "N2",
      "value": "10k",
      "phaseDeg": 0
    }
  ]
}

Rules:
1. Allowed "kind" values ONLY: "resistor", "capacitor", "inductor", "voltage_source", "current_source".
2. Node naming:
   - Use "0" for the ground / reference node (or bottom return rail if no ground symbol is drawn).
   - Name all other distinct electrical nodes "N1", "N2", "N3", ...
3. Polarity ("from" -> "to"):
   - For "voltage_source": "from" is the positive (+) terminal, "to" is the negative (-) terminal.
   - For "current_source": "from" is the arrow tail (current leaves "from"), "to" is the arrow head (current enters "to").
   - For passives ("resistor", "capacitor", "inductor"): "from" and "to" are the two connected nodes.
4. Values:
   - Use plain numbers or SI suffixes (f, p, n, u, m, k, M, G, T): e.g. "10k", "4.7u", "100m", "12".
   - All passive values (R, C, L) must be strictly positive.
   - For AC circuits, set "mode": "ac", include positive "frequencyHz" (e.g. 60 or 1000), and write phasor sources as "120∠30°" (or numeric magnitude in "value" with "phaseDeg": 30).

Example 1 (DC):
{
  "schemaVersion": 1,
  "name": "DC Voltage Divider",
  "mode": "dc",
  "elements": [
    { "id": "V1", "kind": "voltage_source", "label": "V1", "from": "N1", "to": "0", "value": "12" },
    { "id": "R1", "kind": "resistor", "label": "R1", "from": "N1", "to": "N2", "value": "2k" },
    { "id": "R2", "kind": "resistor", "label": "R2", "from": "N2", "to": "0", "value": "4k" }
  ]
}

Example 2 (AC):
{
  "schemaVersion": 1,
  "name": "AC RLC Phasor Circuit",
  "mode": "ac",
  "frequencyHz": 1000,
  "acMagnitudeMode": "rms",
  "elements": [
    { "id": "V1", "kind": "voltage_source", "label": "V1", "from": "N1", "to": "0", "value": "120∠30°" },
    { "id": "R1", "kind": "resistor", "label": "R1", "from": "N1", "to": "N2", "value": "100" },
    { "id": "L1", "kind": "inductor", "label": "L1", "from": "N2", "to": "N3", "value": "20m" },
    { "id": "C1", "kind": "capacitor", "label": "C1", "from": "N3", "to": "0", "value": "2.2u" }
  ]
}`;

export type CircuitImportResult =
	| {
			ok: true;
			document: CircuitDocument;
			sourceFormat: 'circuit-document' | 'ai-netlist';
			warnings: string[];
	  }
	| {
			ok: false;
			errors: string[];
	  };

const ALLOWED_KINDS = new Set<ComponentKind>([
	'resistor',
	'capacitor',
	'inductor',
	'voltage_source',
	'current_source',
	'ground',
	'terminal'
]);

const PASSIVE_KINDS = new Set<ComponentKind>(['resistor', 'capacitor', 'inductor']);
const SOURCE_KINDS = new Set<ComponentKind>(['voltage_source', 'current_source']);
const VALID_ROTATIONS = new Set<number>([0, 90, 180, 270]);

function isPlainObject(val: unknown): val is Record<string, unknown> {
	return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Normalizes a `CircuitDocument` into deterministic property order and formats it as pretty JSON.
 */
export function exportCircuitJson(doc: CircuitDocument): string {
	const normalizedComponents = doc.components.map((c) => {
		const out: Record<string, unknown> = {
			id: c.id,
			kind: c.kind,
			label: c.label,
			x: c.x,
			y: c.y,
			rotation: c.rotation,
			value: c.value
		};
		if (c.numericValue !== undefined) out.numericValue = c.numericValue;
		if (c.phaseDeg !== undefined) out.phaseDeg = c.phaseDeg;
		if (c.unit !== undefined) out.unit = c.unit;
		if (c.terminalName !== undefined) out.terminalName = c.terminalName;
		if (c.controlRef !== undefined) out.controlRef = c.controlRef;
		return out;
	});

	const normalizedWires = doc.wires.map((w) => ({
		id: w.id,
		points: w.points.map((p) => ({ x: p.x, y: p.y }))
	}));

	const out: Record<string, unknown> = {
		schemaVersion: 1
	};
	if (doc.id !== undefined) out.id = doc.id;
	if (doc.name !== undefined) out.name = doc.name;
	out.mode = doc.mode;
	out.frequencyHz = doc.frequencyHz;
	if (doc.acMagnitudeMode !== undefined) out.acMagnitudeMode = doc.acMagnitudeMode;
	out.components = normalizedComponents;
	out.wires = normalizedWires;
	if (doc.unknownProblem !== undefined) {
		out.unknownProblem = {
			componentId: doc.unknownProblem.componentId,
			...(doc.unknownProblem.symbol ? { symbol: doc.unknownProblem.symbol } : {}),
			constraint: {
				kind: doc.unknownProblem.constraint.kind,
				targetId: doc.unknownProblem.constraint.targetId,
				value: doc.unknownProblem.constraint.value,
				...(doc.unknownProblem.constraint.label
					? { label: doc.unknownProblem.constraint.label }
					: {})
			}
		};
	}

	return JSON.stringify(out, null, 2);
}

/**
 * Extracts the first balanced JSON object `{ ... }` from raw text,
 * handling markdown code fences and surrounding AI prose.
 */
function extractJsonCandidates(rawText: string): string[] {
	const trimmed = rawText.trim();
	const candidates: string[] = [];

	// 1. Markdown fenced blocks (prefer ```json first, then any ``` block)
	const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
	let match: RegExpExecArray | null;
	while ((match = fenceRegex.exec(trimmed)) !== null) {
		const inner = match[1].trim();
		if (inner) candidates.push(inner);
	}

	// 2. Direct trimmed text if it starts with '{'
	if (trimmed.startsWith('{')) {
		candidates.push(trimmed);
	}

	// 3. Scan for a balanced `{ ... }` object inside surrounding prose
	const scanBalanced = (src: string): string | null => {
		const start = src.indexOf('{');
		if (start === -1) return null;
		let depth = 0;
		let inString = false;
		let escape = false;
		for (let i = start; i < src.length; i++) {
			const ch = src[i];
			if (inString) {
				if (escape) {
					escape = false;
				} else if (ch === '\\') {
					escape = true;
				} else if (ch === '"') {
					inString = false;
				}
				continue;
			}
			if (ch === '"') {
				inString = true;
			} else if (ch === '{') {
				depth++;
			} else if (ch === '}') {
				depth--;
				if (depth === 0) {
					return src.slice(start, i + 1);
				}
			}
		}
		return null;
	};

	const balanced = scanBalanced(trimmed);
	if (balanced && !candidates.includes(balanced)) {
		candidates.push(balanced);
	}

	return candidates;
}

function validateHeader(
	obj: Record<string, unknown>,
	isNetlist: boolean,
	errors: string[],
	warnings: string[]
): { mode: AnalysisMode; frequencyHz: number; acMagnitudeMode?: AcMagnitudeMode } {
	if (obj.schemaVersion !== undefined && obj.schemaVersion !== 1) {
		errors.push(`Unsupported schemaVersion "${String(obj.schemaVersion)}" (expected 1).`);
	}

	let mode: AnalysisMode = 'dc';
	if (obj.mode !== 'dc' && obj.mode !== 'ac') {
		errors.push(
			`Invalid or missing "mode" (${JSON.stringify(obj.mode)}); expected "dc" or "ac".`
		);
	} else {
		mode = obj.mode;
	}

	let frequencyHz = 60;
	if (obj.frequencyHz === undefined) {
		if (mode === 'ac') {
			errors.push('Missing "frequencyHz" for AC circuit (must be a positive finite number).');
		} else if (!isNetlist) {
			warnings.push('Missing "frequencyHz"; defaulted to 60 Hz.');
		}
	} else if (
		typeof obj.frequencyHz !== 'number' ||
		!Number.isFinite(obj.frequencyHz) ||
		obj.frequencyHz <= 0
	) {
		errors.push(
			`Invalid "frequencyHz" (${JSON.stringify(obj.frequencyHz)}); expected a positive finite number.`
		);
	} else {
		frequencyHz = obj.frequencyHz;
	}

	let acMagnitudeMode: AcMagnitudeMode | undefined;
	if (obj.acMagnitudeMode !== undefined) {
		if (obj.acMagnitudeMode !== 'rms' && obj.acMagnitudeMode !== 'peak') {
			errors.push(
				`Invalid "acMagnitudeMode" (${JSON.stringify(obj.acMagnitudeMode)}); expected "rms" or "peak".`
			);
		} else {
			acMagnitudeMode = obj.acMagnitudeMode;
		}
	}

	return { mode, frequencyHz, acMagnitudeMode };
}

function parseCircuitDocumentFormat(obj: Record<string, unknown>): CircuitImportResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	const { mode, frequencyHz, acMagnitudeMode } = validateHeader(obj, false, errors, warnings);

	if (!Array.isArray(obj.components)) {
		errors.push('Missing or invalid "components" array.');
	}
	if (!Array.isArray(obj.wires)) {
		errors.push('Missing or invalid "wires" array.');
	}
	if (errors.length > 0) {
		return { ok: false, errors };
	}

	const rawComponents = obj.components as unknown[];
	const rawWires = obj.wires as unknown[];
	const components: CircuitComponent[] = [];
	const seenCompIds = new Set<string>();

	rawComponents.forEach((raw, idx) => {
		const prefix = `Component[${idx}]`;
		if (!isPlainObject(raw)) {
			errors.push(`${prefix}: expected an object.`);
			return;
		}

		if (typeof raw.id !== 'string' || raw.id.trim() === '') {
			errors.push(`${prefix}: "id" must be a non-empty string.`);
		} else if (seenCompIds.has(raw.id)) {
			errors.push(`${prefix}: duplicate component id "${raw.id}".`);
		} else {
			seenCompIds.add(raw.id);
		}

		if (typeof raw.kind !== 'string' || !ALLOWED_KINDS.has(raw.kind as ComponentKind)) {
			errors.push(
				`${prefix} (${String(raw.id ?? '?')}): invalid kind "${String(raw.kind)}".`
			);
			return;
		}
		const kind = raw.kind as ComponentKind;

		if (typeof raw.label !== 'string' || raw.label.trim() === '') {
			errors.push(`${prefix} (${String(raw.id ?? '?')}): "label" must be a non-empty string.`);
		}

		if (typeof raw.x !== 'number' || !Number.isFinite(raw.x)) {
			errors.push(`${prefix} (${String(raw.id ?? '?')}): "x" must be a finite number.`);
		}
		if (typeof raw.y !== 'number' || !Number.isFinite(raw.y)) {
			errors.push(`${prefix} (${String(raw.id ?? '?')}): "y" must be a finite number.`);
		}
		if (typeof raw.rotation !== 'number' || !VALID_ROTATIONS.has(raw.rotation)) {
			errors.push(
				`${prefix} (${String(raw.id ?? '?')}): "rotation" must be 0, 90, 180, or 270.`
			);
		}

		let valueStr = '';
		if (kind === 'ground' || kind === 'terminal') {
			valueStr = typeof raw.value === 'string' ? raw.value : '0';
		} else {
			if (typeof raw.value !== 'string' || raw.value.trim() === '') {
				errors.push(
					`${prefix} (${String(raw.id ?? '?')}): "value" must be a non-empty string.`
				);
			} else {
				valueStr = raw.value.trim();
			}
		}

		if (raw.phaseDeg !== undefined && (typeof raw.phaseDeg !== 'number' || !Number.isFinite(raw.phaseDeg))) {
			errors.push(
				`${prefix} (${String(raw.id ?? '?')}): "phaseDeg" must be a finite number.`
			);
		}

		const candidate: CircuitComponent = {
			id: typeof raw.id === 'string' ? raw.id.trim() : `C${idx}`,
			kind,
			label: typeof raw.label === 'string' ? raw.label.trim() : `C${idx}`,
			x: typeof raw.x === 'number' ? raw.x : 0,
			y: typeof raw.y === 'number' ? raw.y : 0,
			rotation: (VALID_ROTATIONS.has(Number(raw.rotation)) ? raw.rotation : 0) as Rotation,
			value: valueStr
		};
		if (typeof raw.numericValue === 'number' && Number.isFinite(raw.numericValue)) {
			candidate.numericValue = raw.numericValue;
		}
		if (typeof raw.phaseDeg === 'number' && Number.isFinite(raw.phaseDeg)) {
			candidate.phaseDeg = raw.phaseDeg;
		}
		if (typeof raw.unit === 'string') candidate.unit = raw.unit;
		if (typeof raw.terminalName === 'string') candidate.terminalName = raw.terminalName;
		if (isPlainObject(raw.controlRef)) {
			candidate.controlRef = raw.controlRef as CircuitComponent['controlRef'];
		}

		if (PASSIVE_KINDS.has(kind) && valueStr !== '') {
			if (parsePassiveValue(candidate) === null) {
				errors.push(
					`${prefix} (${candidate.label}): passive value "${valueStr}" must be a positive finite number.`
				);
			}
		} else if (SOURCE_KINDS.has(kind) && valueStr !== '') {
			if (parseSourceValue(candidate, mode) === null) {
				errors.push(
					`${prefix} (${candidate.label}): invalid ${mode.toUpperCase()} source value "${valueStr}".`
				);
			}
		}

		components.push(candidate);
	});

	const wires: CircuitWire[] = [];
	const seenWireIds = new Set<string>();
	rawWires.forEach((raw, idx) => {
		const prefix = `Wire[${idx}]`;
		if (!isPlainObject(raw)) {
			errors.push(`${prefix}: expected an object.`);
			return;
		}
		if (typeof raw.id !== 'string' || raw.id.trim() === '') {
			errors.push(`${prefix}: "id" must be a non-empty string.`);
		} else if (seenWireIds.has(raw.id)) {
			errors.push(`${prefix}: duplicate wire id "${raw.id}".`);
		} else {
			seenWireIds.add(raw.id);
		}
		if (!Array.isArray(raw.points) || raw.points.length < 2) {
			errors.push(`${prefix} (${String(raw.id ?? '?')}): "points" must have at least 2 points.`);
			return;
		}
		const pts: Array<{ x: number; y: number }> = [];
		raw.points.forEach((pt, pIdx) => {
			if (
				!isPlainObject(pt) ||
				typeof pt.x !== 'number' ||
				!Number.isFinite(pt.x) ||
				typeof pt.y !== 'number' ||
				!Number.isFinite(pt.y)
			) {
				errors.push(`${prefix}.points[${pIdx}]: must be { x, y } with finite numbers.`);
			} else {
				pts.push({ x: pt.x, y: pt.y });
			}
		});
		wires.push({
			id: typeof raw.id === 'string' ? raw.id.trim() : `w${idx}`,
			points: pts
		});
	});

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	const document: CircuitDocument = {
		schemaVersion: 1,
		mode,
		frequencyHz,
		components,
		wires
	};
	if (typeof obj.id === 'string' && obj.id.trim() !== '') document.id = obj.id.trim();
	if (typeof obj.name === 'string' && obj.name.trim() !== '') document.name = obj.name.trim();
	if (acMagnitudeMode) document.acMagnitudeMode = acMagnitudeMode;
	if (isPlainObject(obj.unknownProblem)) {
		const up = obj.unknownProblem;
		const c = up.constraint;
		const validConstraintKinds: ConstraintKind[] = [
			'node_voltage',
			'branch_voltage',
			'branch_current',
			'branch_power'
		];
		if (
			isPlainObject(c) &&
			typeof up.componentId === 'string' &&
			up.componentId.trim() !== '' &&
			typeof c.kind === 'string' &&
			validConstraintKinds.includes(c.kind as ConstraintKind) &&
			typeof c.targetId === 'string' &&
			c.targetId.trim() !== '' &&
			typeof c.value === 'string'
		) {
			document.unknownProblem = {
				componentId: up.componentId.trim(),
				symbol: typeof up.symbol === 'string' && up.symbol.trim() ? up.symbol.trim() : undefined,
				constraint: {
					kind: c.kind as ConstraintKind,
					targetId: c.targetId.trim(),
					value: c.value.trim(),
					label: typeof c.label === 'string' && c.label.trim() ? c.label.trim() : undefined
				}
			};
		}
	}

	return {
		ok: true,
		document,
		sourceFormat: 'circuit-document',
		warnings
	};
}

function parseAiNetlistFormat(obj: Record<string, unknown>): CircuitImportResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	const { mode, frequencyHz, acMagnitudeMode } = validateHeader(obj, true, errors, warnings);

	if (!Array.isArray(obj.elements) || obj.elements.length === 0) {
		errors.push('Missing or empty "elements" array in AI netlist.');
		return { ok: false, errors };
	}

	const elements: LayoutNetlistElement[] = [];
	const seenIds = new Set<string>();

	(obj.elements as unknown[]).forEach((raw, idx) => {
		const prefix = `Element[${idx}]`;
		if (!isPlainObject(raw)) {
			errors.push(`${prefix}: expected an object.`);
			return;
		}

		let elId: string | undefined;
		if (raw.id !== undefined) {
			if (typeof raw.id !== 'string' || raw.id.trim() === '') {
				errors.push(`${prefix}: "id" must be a non-empty string if provided.`);
			} else {
				elId = raw.id.trim();
				if (seenIds.has(elId)) {
					errors.push(`${prefix}: duplicate element id "${elId}".`);
				}
				seenIds.add(elId);
			}
		}

		if (typeof raw.kind !== 'string' || !ALLOWED_KINDS.has(raw.kind as ComponentKind)) {
			errors.push(
				`${prefix} (${elId ?? '?'}): invalid kind "${String(raw.kind)}". Allowed: resistor, capacitor, inductor, voltage_source, current_source, ground, terminal.`
			);
			return;
		}
		const kind = raw.kind as ComponentKind;
		const displayName =
			(typeof raw.label === 'string' && raw.label.trim()) || elId || `${kind}#${idx + 1}`;

		// Validate nodes (accept either from/to or nodes: [from, to])
		let fromNode = '';
		let toNode = '';
		if (kind === 'ground' || kind === 'terminal') {
			const n =
				(typeof raw.from === 'string' && raw.from.trim()) ||
				(Array.isArray(raw.nodes) && typeof raw.nodes[0] === 'string' && raw.nodes[0].trim()) ||
				(typeof raw.to === 'string' && raw.to.trim()) ||
				'';
			if (!n) {
				errors.push(`${prefix} (${displayName}): missing node name for ${kind}.`);
			}
			fromNode = n;
			toNode = n;
		} else {
			if (raw.from !== undefined || raw.to !== undefined) {
				if (typeof raw.from !== 'string' || raw.from.trim() === '') {
					errors.push(`${prefix} (${displayName}): "from" must be a non-empty node string.`);
				} else {
					fromNode = raw.from.trim();
				}
				if (typeof raw.to !== 'string' || raw.to.trim() === '') {
					errors.push(`${prefix} (${displayName}): "to" must be a non-empty node string.`);
				} else {
					toNode = raw.to.trim();
				}
			} else if (Array.isArray(raw.nodes)) {
				if (
					raw.nodes.length !== 2 ||
					typeof raw.nodes[0] !== 'string' ||
					raw.nodes[0].trim() === '' ||
					typeof raw.nodes[1] !== 'string' ||
					raw.nodes[1].trim() === ''
				) {
					errors.push(
						`${prefix} (${displayName}): "nodes" must be an array of 2 non-empty node strings.`
					);
				} else {
					fromNode = raw.nodes[0].trim();
					toNode = raw.nodes[1].trim();
				}
			} else {
				errors.push(
					`${prefix} (${displayName}): must specify "from" & "to" (or "nodes": [from, to]).`
				);
			}
		}

		if (fromNode && toNode && fromNode === toNode && kind !== 'ground' && kind !== 'terminal') {
			warnings.push(
				`Element "${displayName}" has identical "from" and "to" nodes ("${fromNode}").`
			);
		}

		// Validate value
		let valueStr = '';
		if (kind === 'ground' || kind === 'terminal') {
			valueStr = typeof raw.value === 'string' ? raw.value.trim() : '0';
		} else {
			if (typeof raw.value === 'number' && Number.isFinite(raw.value)) {
				valueStr = String(raw.value);
				warnings.push(
					`Element "${displayName}" provided numeric value ${raw.value}; normalized to "${valueStr}".`
				);
			} else if (typeof raw.value === 'string' && raw.value.trim() !== '') {
				valueStr = raw.value.trim();
			} else {
				errors.push(`${prefix} (${displayName}): "value" must be a non-empty string.`);
			}
		}

		let phaseDeg: number | undefined;
		if (raw.phaseDeg !== undefined) {
			if (typeof raw.phaseDeg !== 'number' || !Number.isFinite(raw.phaseDeg)) {
				errors.push(`${prefix} (${displayName}): "phaseDeg" must be a finite number.`);
			} else {
				phaseDeg = raw.phaseDeg;
			}
		}

		if (PASSIVE_KINDS.has(kind) && valueStr !== '') {
			const parsed = parseEngineeringNumber(valueStr);
			if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
				errors.push(
					`${prefix} (${displayName}): passive value "${valueStr}" must be a positive finite number.`
				);
			}
		} else if (SOURCE_KINDS.has(kind) && valueStr !== '') {
			const parsed = parseComplexValue(valueStr);
			if (!parsed || !parsed.isFinite()) {
				errors.push(
					`${prefix} (${displayName}): invalid source value "${valueStr}".`
				);
			} else if (mode === 'dc' && !parsed.isReal(1e-12)) {
				errors.push(
					`${prefix} (${displayName}): complex/phasor value "${valueStr}" is not valid in DC mode.`
				);
			}
		}

		const el: LayoutNetlistElement = {
			kind,
			from: fromNode,
			to: toNode,
			value: valueStr
		};
		if (elId !== undefined) el.id = elId;
		if (typeof raw.label === 'string' && raw.label.trim() !== '') el.label = raw.label.trim();
		if (phaseDeg !== undefined) el.phaseDeg = phaseDeg;
		if (typeof raw.frequencyHz === 'number' && Number.isFinite(raw.frequencyHz)) {
			el.frequencyHz = raw.frequencyHz;
		}
		if (raw.sourceMode === 'dc' || raw.sourceMode === 'ac') el.sourceMode = raw.sourceMode;
		if (typeof raw.terminalName === 'string') el.terminalName = raw.terminalName;

		elements.push(el);
	});

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	const document = layoutNetlistToDocument({
		schemaVersion: 1,
		id: typeof obj.id === 'string' ? obj.id.trim() : undefined,
		name: typeof obj.name === 'string' ? obj.name.trim() : undefined,
		mode,
		frequencyHz,
		acMagnitudeMode,
		groundNode: typeof obj.groundNode === 'string' ? obj.groundNode.trim() : undefined,
		elements
	});

	const graph = buildElectricalGraph(document);
	for (const diag of graph.diagnostics) {
		if (diag.severity === 'warning' || diag.severity === 'info') {
			warnings.push(diag.message);
		}
	}

	return {
		ok: true,
		document,
		sourceFormat: 'ai-netlist',
		warnings
	};
}

/**
 * Parses either a full `CircuitDocument` JSON or an AI-generated `AINetlistDocument` JSON
 * (automatically stripping markdown code fences or surrounding AI commentary).
 */
export function parseCircuitImport(rawText: string): CircuitImportResult {
	if (typeof rawText !== 'string' || rawText.trim() === '') {
		return {
			ok: false,
			errors: ['Input is empty. Paste Circuit Lab JSON or AI-generated netlist JSON.']
		};
	}

	const candidates = extractJsonCandidates(rawText);
	if (candidates.length === 0) {
		return {
			ok: false,
			errors: ['No JSON object found in input. Expected a JSON object starting with "{".']
		};
	}

	let parsed: unknown = null;
	let lastParseError = 'Invalid JSON syntax.';
	let didParse = false;

	for (const candidate of candidates) {
		try {
			parsed = JSON.parse(candidate);
			didParse = true;
			break;
		} catch (err) {
			lastParseError = err instanceof Error ? err.message : String(err);
		}
	}

	if (!didParse) {
		return {
			ok: false,
			errors: [`Invalid JSON: ${lastParseError}`]
		};
	}

	if (!isPlainObject(parsed)) {
		return {
			ok: false,
			errors: ['Top-level JSON value must be an object ({ ... }).']
		};
	}

	if ('components' in parsed) {
		return parseCircuitDocumentFormat(parsed);
	}

	if ('elements' in parsed) {
		return parseAiNetlistFormat(parsed);
	}

	return {
		ok: false,
		errors: [
			'Unrecognized JSON format: expected either a CircuitDocument ("components" + "wires") or an AI netlist ("elements").'
		]
	};
}
