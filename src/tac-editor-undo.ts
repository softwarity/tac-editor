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
export class UndoManager {
  private _undoStack: EditorHistoryState[] = [];
  private _redoStack: EditorHistoryState[] = [];
  private _maxHistory: number;

  constructor(maxHistory: number = 100) {
    this._maxHistory = maxHistory;
  }

  /**
   * Save current state to undo stack BEFORE making changes
   */
  saveState(state: EditorHistoryState): void {
    this._undoStack.push({
      lines: [...state.lines],
      cursorLine: state.cursorLine,
      cursorColumn: state.cursorColumn
    });

    // Limit history size
    if (this._undoStack.length > this._maxHistory) {
      this._undoStack.shift();
    }

    // Clear redo stack on new action
    this._redoStack = [];
  }

  /**
   * Undo: restore previous state
   * @returns The restored state, or null if nothing to undo
   */
  undo(currentState: EditorHistoryState): EditorHistoryState | null {
    if (this._undoStack.length === 0) return null;

    // Save current state to redo stack
    this._redoStack.push({
      lines: [...currentState.lines],
      cursorLine: currentState.cursorLine,
      cursorColumn: currentState.cursorColumn
    });

    // Restore previous state from undo stack
    const state = this._undoStack.pop()!;
    return {
      lines: [...state.lines],
      cursorLine: state.cursorLine,
      cursorColumn: state.cursorColumn
    };
  }

  /**
   * Redo: restore next state
   * @returns The restored state, or null if nothing to redo
   */
  redo(currentState: EditorHistoryState): EditorHistoryState | null {
    if (this._redoStack.length === 0) return null;

    // Save current state to undo stack
    this._undoStack.push({
      lines: [...currentState.lines],
      cursorLine: currentState.cursorLine,
      cursorColumn: currentState.cursorColumn
    });

    // Restore next state from redo stack
    const state = this._redoStack.pop()!;
    return {
      lines: [...state.lines],
      cursorLine: state.cursorLine,
      cursorColumn: state.cursorColumn
    };
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this._undoStack = [];
    this._redoStack = [];
  }

  /**
   * Get the number of undo states available
   */
  get undoCount(): number {
    return this._undoStack.length;
  }

  /**
   * Get the number of redo states available
   */
  get redoCount(): number {
    return this._redoStack.length;
  }
}
