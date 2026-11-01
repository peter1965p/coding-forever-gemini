import { ToolDef } from './types';

/**
 * Tool-Schemata zwischen den Anbietern übersetzen.
 *
 * Die eingebauten Tools haben flache Parameter (nur Strings/Zahlen/Booleans).
 * MCP-Server liefern dagegen beliebiges JSON Schema mit verschachtelten
 * Objekten, Arrays und Enums — deshalb gibt es hier eine gemeinsame Basis.
 */

export type JsonSchema = Record<string, any>;

/** Das JSON Schema eines Tools: entweder direkt mitgeliefert oder aus den flachen Parametern gebaut. */
export function toJsonSchema(tool: ToolDef): JsonSchema {
    if (tool.inputSchema) {
        // MCP-Server liefern gelegentlich ein Schema ohne "type" — ohne das
        // lehnen OpenAI und Anthropic den Tool-Aufruf ab.
        const schema = { ...tool.inputSchema };
        if (!schema.type) { schema.type = 'object'; }
        if (schema.type === 'object' && !schema.properties) { schema.properties = {}; }
        return schema;
    }

    return {
        type: 'object',
        properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([key, param]) => [
                key,
                { type: param.type, description: param.description }
            ])
        ),
        required: tool.required
    };
}

/**
 * Felder, die Gemini in seinem Schema-Dialekt kennt. Alles andere ($schema,
 * additionalProperties, oneOf, allOf, patternProperties, const, examples …)
 * lässt die API mit "Invalid JSON payload" auflaufen und muss raus.
 */
const GEMINI_KEEP = new Set([
    'type', 'format', 'description', 'nullable', 'enum',
    'items', 'properties', 'required', 'minItems', 'maxItems', 'anyOf'
]);

/** Von Gemini unterstützte format-Werte, je nach Typ. */
const GEMINI_FORMATS: Record<string, Set<string>> = {
    STRING: new Set(['enum', 'date-time']),
    INTEGER: new Set(['int32', 'int64']),
    NUMBER: new Set(['float', 'double'])
};

function geminiType(rawType: unknown): { type: string; nullable: boolean } {
    // JSON Schema erlaubt type: ["string", "null"]; Gemini kennt nur einen Typ plus nullable.
    if (Array.isArray(rawType)) {
        const nullable = rawType.includes('null');
        const concrete = rawType.find(entry => entry !== 'null');
        return { type: String(concrete ?? 'string').toUpperCase(), nullable };
    }
    return { type: String(rawType ?? 'string').toUpperCase(), nullable: false };
}

/**
 * JSON Schema → Gemini-Schema. Rekursiv, weil MCP-Tools verschachtelte
 * Objekte und Arrays mitbringen.
 */
export function toGeminiSchema(schema: JsonSchema | undefined, depth = 0): JsonSchema {
    // Gegen zyklische oder absurd tiefe Schemata absichern.
    if (!schema || typeof schema !== 'object' || depth > 12) {
        return { type: 'STRING' };
    }

    if (Array.isArray(schema.anyOf)) {
        const variants = schema.anyOf
            .filter((entry: any) => entry && entry.type !== 'null')
            .map((entry: any) => toGeminiSchema(entry, depth + 1));
        if (variants.length === 1) { return variants[0]; }
        if (variants.length > 1) {
            return { anyOf: variants, ...(schema.description ? { description: schema.description } : {}) };
        }
    }

    const { type, nullable } = geminiType(schema.type);
    const out: JsonSchema = { type };

    if (schema.description) { out.description = String(schema.description); }
    if (nullable || schema.nullable === true) { out.nullable = true; }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
        // Gemini erwartet Enum-Werte als Strings.
        out.enum = schema.enum.map((value: unknown) => String(value));
        out.type = 'STRING';
    }

    if (typeof schema.format === 'string' && GEMINI_FORMATS[out.type]?.has(schema.format)) {
        out.format = schema.format;
    }

    if (out.type === 'OBJECT') {
        const properties = schema.properties ?? {};
        out.properties = Object.fromEntries(
            Object.entries(properties).map(([key, value]) => [key, toGeminiSchema(value as JsonSchema, depth + 1)])
        );
        // Gemini lehnt ein OBJECT ohne properties ab — dann lieber den Typ weglassen.
        if (Object.keys(out.properties).length === 0) {
            delete out.properties;
        }
        const required = (schema.required ?? []).filter(
            (key: string) => !out.properties || key in out.properties
        );
        if (required.length > 0) { out.required = required; }
    }

    if (out.type === 'ARRAY') {
        out.items = toGeminiSchema(schema.items, depth + 1);
        if (typeof schema.minItems === 'number') { out.minItems = schema.minItems; }
        if (typeof schema.maxItems === 'number') { out.maxItems = schema.maxItems; }
    }

    // Unbekannte Keywords bewusst nicht durchreichen.
    for (const key of Object.keys(out)) {
        if (!GEMINI_KEEP.has(key)) { delete out[key]; }
    }

    return out;
}

/** Namen, die alle vier Anbieter als Function-Name akzeptieren. */
export function sanitizeToolName(raw: string, maxLength = 60): string {
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_{2,}/g, '_');
    return cleaned.slice(0, maxLength).replace(/^[-_]+|[-_]+$/g, '') || 'tool';
}
