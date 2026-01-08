/**
 * @softwarity/tac-editor - Built-in Validators
 * Standard validators for TAC message validation
 *
 * Developers can override these or add custom validators via:
 * editor.registerValidator(name, callback)
 */
import type { ValidatorCallback } from './tac-editor-types.js';
import type { TacEditor } from './tac-editor.js';
/**
 * DDHHmmZ - METAR/SPECI datetime validator
 * Format: Day (01-31) + Hour (00-23) + Minutes (00-59) + Z
 */
export declare const DDHHmmZValidator: ValidatorCallback;
/**
 * DDHH/DDHH - TAF validity period validator
 * Format: StartDay+Hour / EndDay+Hour
 */
export declare const TAFValidityValidator: ValidatorCallback;
/**
 * YYYYMMDDHHmmZ - VAA full datetime validator
 * Format: Year + Month + Day + Hour + Minutes + Z
 */
export declare const VADatetimeValidator: ValidatorCallback;
/**
 * DD/HHmmZ - VAA day/time validator
 * Format: Day / Hour + Minutes + Z
 */
export declare const VADayTimeValidator: ValidatorCallback;
/**
 * FlightLevel - Flight level validator (FL000-FL999)
 */
export declare const FlightLevelValidator: ValidatorCallback;
/**
 * ICAO - ICAO location indicator validator
 */
export declare const ICAOValidator: ValidatorCallback;
/**
 * TAF Short validity period validator (FC)
 * Validity must be ≤ 12 hours
 */
export declare const TAFShortValidityValidator: ValidatorCallback;
/**
 * TAF Long validity period validator (FT)
 * Validity must be > 12 hours and ≤ 30 hours
 */
export declare const TAFLongValidityValidator: ValidatorCallback;
/**
 * Map of built-in validator names to their implementations
 */
export declare const BUILTIN_VALIDATORS: Record<string, ValidatorCallback>;
/**
 * Register all built-in validators on an editor instance
 * @param editor - TacEditor instance to register validators on
 */
export declare function registerBuiltinValidators(editor: TacEditor): void;
