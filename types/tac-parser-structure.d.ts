/**
 * TAC Parser - Structure Tracker
 * Tracks position in grammar structure tree during parsing
 */
import { StructureNode, TokenDefinition } from './tac-parser-types.js';
/**
 * Tracks position in grammar structure tree during parsing.
 * Handles sequences, oneOf alternatives, and cardinality constraints.
 */
export declare class StructureTracker {
    private structure;
    private tokens;
    private matchCounts;
    private currentIndex;
    private oneOfChoices;
    constructor(structure: StructureNode[], tokens: Record<string, TokenDefinition>);
    /**
     * Reset tracker to initial state
     */
    reset(): void;
    /**
     * Clear counters for a node and all its descendants (for sequence repetition)
     */
    private _clearNodeCounters;
    private _debug;
    /**
     * Enable or disable debug mode
     */
    setDebug(enabled: boolean): void;
    /**
     * Get all token IDs that could match at current position.
     * This considers:
     * - Current position in sequence
     * - Optional elements (can be skipped)
     * - OneOf alternatives (all options valid until one matches)
     * - Cardinality (repeatable elements)
     */
    getExpectedTokenIds(): string[];
    /**
     * Try to match a token ID at current position.
     * Returns true if matched and position was advanced.
     */
    tryMatch(tokenId: string): boolean;
    /**
     * Check if a node is effectively optional (can be satisfied with 0 matches).
     * This includes:
     * - Nodes with minCard=0
     * - OneOf nodes where ALL children have minCard=0
     * - Sequence nodes where ALL children are effectively optional
     */
    private _isEffectivelyOptional;
    /**
     * Collect expected tokens starting from a position in a sequence
     */
    private _collectExpectedTokens;
    /**
     * Check if a node has children that can still accept matches
     */
    private _hasActiveChildren;
    /**
     * Check if a token could match the first element of a node (ignoring match counts)
     * Used to determine if starting a new repetition is viable
     */
    private _couldMatchFirstElement;
    /**
     * Collect tokens from the first element of a node (ignoring match counts)
     * Used for collecting tokens that could start a new repetition
     */
    private _collectFirstTokensFromNode;
    /**
     * Collect token IDs from a single node (handles oneOf, sequence, or token)
     */
    private _collectTokensFromNode;
    /**
     * Try to match a token at a level, advancing position if successful
     */
    private _tryMatchAtLevel;
    /**
     * Try to match a token against a specific node
     */
    private _tryMatchNode;
    /**
     * Get current position info for debugging
     */
    getDebugInfo(): {
        currentIndex: number;
        matchCounts: Record<string, number>;
    };
}
