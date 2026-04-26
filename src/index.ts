/**
 * typedSwitch - A type-safe switch statement for discriminated unions
 *
 * Supports two input modes:
 *
 * 1. STRING INPUT - switch on a string/enum value directly:
 *
 *    @example
 *    const status: 'success' | 'error' = 'success'
 *
 *    // All cases required (no default)
 *    typedSwitch(status, {
 *      success: (val) => 'handled success',
 *      error: (val) => 'handled error',
 *    })
 *
 *    // Partial cases with default handler
 *    typedSwitch(status, {
 *      success: (val) => 'handled success',
 *    }, (val) => 'default handler')
 *
 *
 * 2. OBJECT INPUT - switch on a discriminated union with custom key:
 *
 *    @example
 *    type Event =
 *      | { type: 'click'; x: number; y: number }
 *      | { type: 'scroll'; offset: number }
 *
 *    // All cases required (no default)
 *    typedSwitch(event, 'type', {
 *      click: (e) => `Clicked at ${e.x}, ${e.y}`,
 *      scroll: (e) => `Scrolled ${e.offset}px`,
 *    })
 *
 *    // Partial cases with default handler
 *    typedSwitch(event, 'type', {
 *      click: (e) => `Clicked at ${e.x}, ${e.y}`,
 *    }, (e) => 'unhandled event')
 *
 *    // Works with any discriminant key (not just 'type')
 *    type Order = { status: 'pending' } | { status: 'completed' }
 *    typedSwitch(order, 'status', {
 *      pending: (o) => 'waiting...',
 *      completed: (o) => 'done!',
 *    })
 *
 *
 * 3. WITH CONSTRAINT - use `typedSwitch<T>()` to enforce return type:
 *
 *    @example
 *    interface HasId { id: string }
 *
 *    // All handlers must return something with { id: string }
 *    typedSwitch<HasId>()(status, {
 *      success: () => ({ id: '123', name: 'John' }), // ✓ OK
 *      error: () => ({ id: '456' }), // ✓ OK
 *    })
 *
 *    // Type error - missing 'id' property
 *    typedSwitch<HasId>()(status, {
 *      success: () => ({ name: 'John' }), // ✗ Error!
 *      error: () => ({ id: '456' }),
 *    })
 */

// ═══════════════════════════════════════════════════════════════════════════
// Helper types for return type inference
// ═══════════════════════════════════════════════════════════════════════════

/** Extract raw return type from a handler function (preserves Promise) */
// biome-ignore lint/suspicious/noExplicitAny: Required for type extraction from functions
type RawHandlerReturnType<T> = T extends (...args: any[]) => infer R ? R : never

/** Get union of all raw return types from a cases object's values */
type RawCasesReturnType<Cases> = {
	[K in keyof Cases]: Cases[K] extends undefined
		? never
		: RawHandlerReturnType<Cases[K]>
}[keyof Cases]

// ═══════════════════════════════════════════════════════════════════════════
// String input mode types
// ═══════════════════════════════════════════════════════════════════════════

/** Cases for string input - all cases required */
export type StringSwitchCases<T extends string, R> = {
	[K in T]: (value: K) => R | Promise<R>
}

/** Partial cases for string input (when default is provided) */
export type PartialStringSwitchCases<T extends string, R> = {
	[K in T]?: (value: K) => R | Promise<R>
}

// ═══════════════════════════════════════════════════════════════════════════
// Object input mode types
// ═══════════════════════════════════════════════════════════════════════════

/** Cases for object input with custom key - all cases required */
export type ObjectSwitchCases<T, K extends keyof T, R> = T[K] extends string
	? {
			[V in T[K]]: (value: Extract<T, Record<K, V>>) => R | Promise<R>
		}
	: never

/** Partial cases for object input with custom key (when default is provided) */
export type PartialObjectSwitchCases<
	T,
	K extends keyof T,
	R
> = T[K] extends string
	? {
			[V in T[K]]?: (value: Extract<T, Record<K, V>>) => R | Promise<R>
		}
	: never

type Handler = (value: unknown) => unknown
type CasesRecord = Record<string, Handler | undefined>

function runSwitch(
	value: string | Record<string, unknown>,
	keyOrCases: string | CasesRecord,
	casesOrDefault?: CasesRecord | Handler,
	defaultCase?: Handler
): unknown {
	let key: string
	let cases: CasesRecord
	let defaultHandler: Handler | undefined
	let discriminantKey: string | undefined

	if (typeof value === 'string') {
		// String input: typedSwitch(string, cases, default?)
		key = value
		cases = keyOrCases as CasesRecord
		defaultHandler = casesOrDefault as Handler | undefined
	} else {
		// Object input: typedSwitch(obj, key, cases, default?)
		if (typeof keyOrCases !== 'string') {
			throw new Error(
				'Invalid typedSwitch call: object mode requires a string discriminant key'
			)
		}

		discriminantKey = keyOrCases
		const discriminantValue = value[discriminantKey]
		if (typeof discriminantValue !== 'string') {
			throw new Error(
				`Invalid discriminant value for key "${discriminantKey}": expected string, received ${typeof discriminantValue}`
			)
		}

		key = discriminantValue
		cases = casesOrDefault as CasesRecord
		defaultHandler = defaultCase
	}

	const handler = cases[key]

	if (handler) {
		return handler(value)
	}

	if (defaultHandler) {
		return defaultHandler(value)
	}

	const availableCases = Object.keys(cases).join(', ')
	const availableCasesSuffix =
		availableCases.length > 0
			? ` Available cases: ${availableCases}`
			: ' Available cases: (none)'
	const contextSuffix = discriminantKey
		? ` (discriminant key: "${discriminantKey}")`
		: ''

	throw new Error(
		`Unhandled case: ${key}${contextSuffix}.${availableCasesSuffix}`
	)
}

// ═══════════════════════════════════════════════════════════════════════════
// Function overloads
// ═══════════════════════════════════════════════════════════════════════════

/** A constrained typedSwitch factory returned by `typedSwitch<Constraint>()` */
export type ConstrainedTypedSwitch<Constraint> = {
	// String input - all cases required (no default)
	<
		T extends string,
		Cases extends { [K in T]: (value: K) => Constraint | Promise<Constraint> }
	>(
		value: T,
		cases: Cases
	): RawCasesReturnType<Cases>

	// String input - partial cases allowed (with default)
	<
		T extends string,
		Cases extends { [K in T]?: (value: K) => Constraint | Promise<Constraint> },
		DefaultCase extends (value: T) => Constraint | Promise<Constraint>
	>(
		value: T,
		cases: Cases,
		defaultCase: DefaultCase
	): RawCasesReturnType<Cases> | RawHandlerReturnType<DefaultCase>

	// Object input with key - all cases required (no default)
	<
		T extends Record<string, unknown>,
		K extends keyof T,
		TKey extends T[K] & string,
		Cases extends {
			[V in TKey]: (
				value: Extract<T, Record<K, V>>
			) => Constraint | Promise<Constraint>
		}
	>(
		value: T,
		key: K,
		cases: Cases
	): RawCasesReturnType<Cases>

	// Object input with key - partial cases allowed (with default)
	<
		T extends Record<string, unknown>,
		K extends keyof T,
		TKey extends T[K] & string,
		Cases extends {
			[V in TKey]?: (
				value: Extract<T, Record<K, V>>
			) => Constraint | Promise<Constraint>
		},
		DefaultCase extends (value: T) => Constraint | Promise<Constraint>
	>(
		value: T,
		key: K,
		cases: Cases,
		defaultCase: DefaultCase
	): RawCasesReturnType<Cases> | RawHandlerReturnType<DefaultCase>
}

// String input - all cases required (no default)
export function typedSwitch<
	T extends string,
	Cases extends { [K in T]: (value: K) => unknown }
>(value: T, cases: Cases): RawCasesReturnType<Cases>

// String input - partial cases allowed (with default)
export function typedSwitch<
	T extends string,
	Cases extends { [K in T]?: (value: K) => unknown },
	DefaultCase extends (value: T) => unknown
>(
	value: T,
	cases: Cases,
	defaultCase: DefaultCase
): RawCasesReturnType<Cases> | RawHandlerReturnType<DefaultCase>

// Object input with key - all cases required (no default)
export function typedSwitch<
	T extends Record<string, unknown>,
	K extends keyof T,
	TKey extends T[K] & string,
	Cases extends { [V in TKey]: (value: Extract<T, Record<K, V>>) => unknown }
>(value: T, key: K, cases: Cases): RawCasesReturnType<Cases>

// Object input with key - partial cases allowed (with default)
export function typedSwitch<
	T extends Record<string, unknown>,
	K extends keyof T,
	TKey extends T[K] & string,
	Cases extends { [V in TKey]?: (value: Extract<T, Record<K, V>>) => unknown },
	DefaultCase extends (value: T) => unknown
>(
	value: T,
	key: K,
	cases: Cases,
	defaultCase: DefaultCase
): RawCasesReturnType<Cases> | RawHandlerReturnType<DefaultCase>

// Constraint mode - returns a constrained typedSwitch
export function typedSwitch<Constraint>(): ConstrainedTypedSwitch<Constraint>

// Implementation
export function typedSwitch(
	value?: string | Record<string, unknown>,
	keyOrCases?: string | CasesRecord,
	casesOrDefault?: CasesRecord | Handler,
	defaultCase?: Handler
): unknown {
	if (value === undefined) {
		return ((
			constrainedValue: string | Record<string, unknown>,
			constrainedKeyOrCases: string | CasesRecord,
			constrainedCasesOrDefault?: CasesRecord | Handler,
			constrainedDefaultCase?: Handler
		): unknown =>
			runSwitch(
				constrainedValue,
				constrainedKeyOrCases,
				constrainedCasesOrDefault,
				constrainedDefaultCase
			)) as ConstrainedTypedSwitch<unknown>
	}

	return runSwitch(
		value,
		keyOrCases as string | CasesRecord,
		casesOrDefault,
		defaultCase
	)
}
