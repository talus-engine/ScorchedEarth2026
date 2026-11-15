import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ELEMENTS, MAX_ELEMENTS, type ElementProperties } from '@/simulation/ElementDatabase';
import { applyElementPatch, validateElement } from '@/simulation/elementValidation';
import { ELEMENT_FIELD_RULES } from '@/simulation/elementFieldRules';
import { shelfSynths } from '@/world/SynthShelf';

const folder = path.resolve(import.meta.dirname, '../../assets/native/elements');
const specs = fs.readdirSync(folder).filter(file => file.endsWith('.json')).sort()
    .map(file => JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')));

it('all authored custom elements pass the current engine schema together', () => {
    const table = structuredClone(ELEMENTS.filter(Boolean)) as ElementProperties[];
    for (const spec of specs) {
        expect(Object.keys(spec.fields).filter(key => !(key in ELEMENT_FIELD_RULES)), spec.name + ' obsolete fields').toEqual([]);
        expect(spec.fields.synth, spec.name + ' is silent').toEqual({ enabled: false, keys: {} });
        const base = table.find(element => element.name === spec.basedOn);
        expect(base, spec.name + ' base ' + spec.basedOn).toBeDefined();
        const element = applyElementPatch(base!, { ...spec.fields, name: spec.name });
        element.id = table.length;
        table.push(element);
    }
    for (const spec of specs) {
        const element = table.find(element => element.name === spec.name)!;
        expect(validateElement(element, { elements: table }), spec.name).toEqual([]);
    }
});

it('project custom elements fit above the current built-ins', () => {
    // Custom ids follow the built-ins; the engine table holds MAX_ELEMENTS ids in all.
    const builtinMax = Math.max(...ELEMENTS.filter(Boolean).map(element => element.id));
    const laser = JSON.parse(fs.readFileSync(path.join(folder, '../materials/laser.json'), 'utf8'));
    const round = JSON.parse(fs.readFileSync(path.join(folder, '../entities/6b6c5547-29da-4a9d-abac-31400ec5094f.json'), 'utf8'));
    const customs = specs.length + 1;
    expect(builtinMax + customs, 'custom element budget').toBeLessThan(MAX_ELEMENTS);
    expect(ELEMENTS.some(element => element?.name === laser.name), 'TERRA_LASER is not a built-in name').toBe(false);
    expect(laser.id, 'TERRA_LASER id above the built-ins').toBeGreaterThan(builtinMax);
    expect(laser.id).toBeLessThan(MAX_ELEMENTS);
    expect(JSON.stringify(round)).toContain(`"elementType":${laser.id},`);
});

it('project element sounds reference playable current shelf synths', () => {
    const patches = JSON.parse(fs.readFileSync(path.join(folder, '../materials/element-audio.json'), 'utf8')).elements;
    const shelf = new Map(shelfSynths().map(row => [row.id, row]));
    const table = structuredClone(ELEMENTS.filter(Boolean)) as ElementProperties[];
    for (const spec of patches) {
        const base = table.find(element => element.name === spec.name) || table.find(element => element.name === spec.basedOn)!;
        const element = applyElementPatch(base, { ...spec.fields, name: spec.name });
        if (element.name !== base.name) element.id = table.length;
        const elements = table.filter(row => row.id !== element.id).concat(element);
        expect(validateElement(element, { elements }), spec.name).toEqual([]);
        for (const key of Object.values(spec.fields.synth.keys) as Array<{ synthId: string }>)
            expect(shelf.has(key.synthId), spec.name + ': ' + key.synthId).toBe(true);
    }
});
