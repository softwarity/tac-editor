/**
 * @softwarity/tac-editor - Built-in Validators
 * Standard validators for TAC message validation
 *
 * Developers can override these or add custom validators via:
 * editor.registerValidator(name, callback)
 */

import type { ValidatorCallback, ValidatorContext } from './tac-editor-types.js';
import type { TacEditor } from './tac-editor.js';

/**
 * DDHHmmZ - METAR/SPECI datetime validator
 * Format: Day (01-31) + Hour (00-23) + Minutes (00-59) + Z
 */
export const DDHHmmZValidator: ValidatorCallback = (ctx: ValidatorContext): string | undefined => {
  const value = ctx.tokenValue.replace(/Z$/i, '');

  if (value.length !== 6) {
    return 'Invalid datetime format';
  }

  const match = value.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!match) {
    return 'Invalid datetime format';
  }

  const [, dd, hh, mm] = match;
  const day = parseInt(dd, 10);
  const hour = parseInt(hh, 10);
  const minute = parseInt(mm, 10);

  if (day < 1 || day > 31) {
    return `Invalid day: ${dd} (must be 01-31)`;
  }

  if (hour > 23) {
    return `Invalid hour: ${hh} (must be 00-23)`;
  }

  if (minute > 59) {
    return `Invalid minutes: ${mm} (must be 00-59)`;
  }

  // Additional check: verify the day is valid for the current month
  const now = new Date();
  const testDate = new Date(now.getFullYear(), now.getMonth(), day);
  if (testDate.getDate() !== day) {
    return `Invalid day: ${dd} for current month`;
  }

  return undefined;
};

/**
 * DDHH/DDHH - TAF validity period validator
 * Format: StartDay+Hour / EndDay+Hour
 */
export const TAFValidityValidator: ValidatorCallback = (ctx: ValidatorContext): string | undefined => {
  const match = ctx.tokenValue.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!match) {
    return 'Invalid validity format (expected DDHH/DDHH)';
  }

  const [, startDay, startHour, endDay, endHour] = match;
  const sd = parseInt(startDay, 10);
  const sh = parseInt(startHour, 10);
  const ed = parseInt(endDay, 10);
  const eh = parseInt(endHour, 10);

  if (sd < 1 || sd > 31) {
    return `Invalid start day: ${startDay}`;
  }

  if (sh > 24) {
    return `Invalid start hour: ${startHour}`;
  }

  if (ed < 1 || ed > 31) {
    return `Invalid end day: ${endDay}`;
  }

  if (eh > 24) {
    return `Invalid end hour: ${endHour}`;
  }

  return undefined;
};

/**
 * YYYYMMDDHHmmZ - VAA full datetime validator
 * Format: Year + Month + Day + Hour + Minutes + Z
 */
export const VADatetimeValidator: ValidatorCallback = (ctx: ValidatorContext): string | undefined => {
  const value = ctx.tokenValue.replace(/Z$/i, '');

  // Format: YYYYMMDD/HHmm
  const match = value.match(/^(\d{4})(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!match) {
    return 'Invalid datetime format (expected YYYYMMDD/HHmmZ)';
  }

  const [, yyyy, mm, dd, hh, min] = match;
  const year = parseInt(yyyy, 10);
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  const hour = parseInt(hh, 10);
  const minute = parseInt(min, 10);

  if (year < 2000 || year > 2100) {
    return `Invalid year: ${yyyy}`;
  }

  if (month < 1 || month > 12) {
    return `Invalid month: ${mm}`;
  }

  if (day < 1 || day > 31) {
    return `Invalid day: ${dd}`;
  }

  if (hour > 23) {
    return `Invalid hour: ${hh}`;
  }

  if (minute > 59) {
    return `Invalid minutes: ${min}`;
  }

  // Verify date is valid
  const testDate = new Date(year, month - 1, day);
  if (testDate.getFullYear() !== year || testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
    return `Invalid date: ${yyyy}-${mm}-${dd}`;
  }

  return undefined;
};

/**
 * DD/HHmmZ - VAA day/time validator
 * Format: Day / Hour + Minutes + Z
 */
export const VADayTimeValidator: ValidatorCallback = (ctx: ValidatorContext): string | undefined => {
  const value = ctx.tokenValue.replace(/Z$/i, '');

  const match = value.match(/^(\d{2})\/(\d{2})(\d{2})$/);
  if (!match) {
    return 'Invalid datetime format (expected DD/HHmmZ)';
  }

  const [, dd, hh, mm] = match;
  const day = parseInt(dd, 10);
  const hour = parseInt(hh, 10);
  const minute = parseInt(mm, 10);

  if (day < 1 || day > 31) {
    return `Invalid day: ${dd}`;
  }

  if (hour > 23) {
    return `Invalid hour: ${hh}`;
  }

  if (minute > 59) {
    return `Invalid minutes: ${mm}`;
  }

  return undefined;
};

/**
 * FlightLevel - Flight level validator (FL000-FL999)
 */
export const FlightLevelValidator: ValidatorCallback = (ctx: ValidatorContext): string | undefined => {
  const match = ctx.tokenValue.match(/^FL(\d{3})$/i);
  if (!match) {
    return 'Invalid flight level format';
  }

  const fl = parseInt(match[1], 10);
  if (fl > 600) {
    return `Flight level ${fl} seems unusually high`;
  }

  return undefined;
};

/**
 * ICAO - ICAO location indicator validator
 */
export const ICAOValidator: ValidatorCallback = (ctx: ValidatorContext): string | undefined => {
  if (!/^[A-Z]{4}$/.test(ctx.tokenValue)) {
    return 'Invalid ICAO code (must be 4 letters)';
  }

  // Could add check against known ICAO codes via provider in the future
  return undefined;
};

/**
 * Calculate validity duration in hours from DDHH/DDHH format
 * Handles day wrap-around (e.g., 0618/0706 = 12 hours)
 */
function calculateValidityHours(startDay: number, startHour: number, endDay: number, endHour: number): number {
  // Calculate hours considering day changes
  let hours: number;
  if (endDay === startDay) {
    // Same day
    hours = endHour - startHour;
  } else if (endDay > startDay) {
    // End day is later in same month
    hours = (endDay - startDay) * 24 + (endHour - startHour);
  } else {
    // End day wrapped to next month (e.g., 31 -> 01)
    // Assume max 31 days in month for simplicity
    hours = (31 - startDay + endDay) * 24 + (endHour - startHour);
  }
  return hours;
}

/**
 * TAF Short validity period validator (FC)
 * Validity must be ≤ 12 hours
 */
export const TAFShortValidityValidator: ValidatorCallback = (ctx: ValidatorContext): string | undefined => {
  const match = ctx.tokenValue.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!match) {
    return 'Invalid validity format (expected DDHH/DDHH)';
  }

  const [, startDay, startHour, endDay, endHour] = match;
  const sd = parseInt(startDay, 10);
  const sh = parseInt(startHour, 10);
  const ed = parseInt(endDay, 10);
  const eh = parseInt(endHour, 10);

  // Basic validation
  if (sd < 1 || sd > 31) return `Invalid start day: ${startDay}`;
  if (sh > 24) return `Invalid start hour: ${startHour}`;
  if (ed < 1 || ed > 31) return `Invalid end day: ${endDay}`;
  if (eh > 24) return `Invalid end hour: ${endHour}`;

  // Check duration
  const hours = calculateValidityHours(sd, sh, ed, eh);
  if (hours <= 0) {
    return 'End time must be after start time';
  }
  if (hours > 12) {
    return `TAF Short validity must be ≤12 hours (got ${hours}h)`;
  }

  return undefined;
};

/**
 * TAF Long validity period validator (FT)
 * Validity must be > 12 hours and ≤ 30 hours
 */
export const TAFLongValidityValidator: ValidatorCallback = (ctx: ValidatorContext): string | undefined => {
  const match = ctx.tokenValue.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!match) {
    return 'Invalid validity format (expected DDHH/DDHH)';
  }

  const [, startDay, startHour, endDay, endHour] = match;
  const sd = parseInt(startDay, 10);
  const sh = parseInt(startHour, 10);
  const ed = parseInt(endDay, 10);
  const eh = parseInt(endHour, 10);

  // Basic validation
  if (sd < 1 || sd > 31) return `Invalid start day: ${startDay}`;
  if (sh > 24) return `Invalid start hour: ${startHour}`;
  if (ed < 1 || ed > 31) return `Invalid end day: ${endDay}`;
  if (eh > 24) return `Invalid end hour: ${endHour}`;

  // Check duration
  const hours = calculateValidityHours(sd, sh, ed, eh);
  if (hours <= 0) {
    return 'End time must be after start time';
  }
  if (hours <= 12) {
    return `TAF Long validity must be >12 hours (got ${hours}h)`;
  }
  if (hours > 30) {
    return `TAF Long validity must be ≤30 hours (got ${hours}h)`;
  }

  return undefined;
};

/**
 * Map of built-in validator names to their implementations
 */
export const BUILTIN_VALIDATORS: Record<string, ValidatorCallback> = {
  'DDHHmmZ': DDHHmmZValidator,
  'DDHH/DDHH': TAFValidityValidator,
  'DDHH/DDHH-short': TAFShortValidityValidator,
  'DDHH/DDHH-long': TAFLongValidityValidator,
  'YYYYMMDD/HHmmZ': VADatetimeValidator,
  'DD/HHmmZ': VADayTimeValidator,
  'FlightLevel': FlightLevelValidator,
  'ICAO': ICAOValidator
};

/**
 * Register all built-in validators on an editor instance
 * @param editor - TacEditor instance to register validators on
 */
export function registerBuiltinValidators(editor: TacEditor): void {
  for (const [name, callback] of Object.entries(BUILTIN_VALIDATORS)) {
    editor.registerValidator(name, callback);
  }
}
