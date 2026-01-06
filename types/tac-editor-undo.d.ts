/**
 * TAC Editor - Undo/Redo Manager
 * Manages history stack for undo/redo operations
 */
/** State snapshot for undo/redo */
export interface EditorHistoryState {
    lines: string[];
    cursorLine: number;
    cursorColumn: number;
}
/**
 * Manages undo/redo history with configurable max size
 */
export declare class UndoManager {
    private _undoStack;
    private _redoStack;
    private _maxHistory;
    constructor(maxHistory?: number);
    /**
     * Save current state to undo stack BEFORE making changes
     */
    saveState(state: EditorHistoryState): void;
    /**
     * Undo: restore previous state
     * @returns The restored state, or null if nothing to undo
     */
    undo(currentState: EditorHistoryState): EditorHistoryState | null;
    /**
     * Redo: restore next state
     * @returns The restored state, or null if nothing to redo
     */
    redo(currentState: EditorHistoryState): EditorHistoryState | null;
    /**
     * Check if undo is available
     */
    canUndo(): boolean;
    /**
     * Check if redo is available
     */
    canRedo(): boolean;
    /**
     * Clear all history
     */
    clear(): void;
    /**
     * Get the number of undo states available
     */
    get undoCount(): number;
    /**
     * Get the number of redo states available
     */
    get redoCount(): number;
}
