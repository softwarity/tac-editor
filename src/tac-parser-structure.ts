/**
 * TAC Parser - Structure Tracker
 * Tracks position in grammar structure tree during parsing
 */

import {
  StructureNode,
  TokenDefinition,
  isStructureOneOf,
  isStructureSequence
} from './tac-parser-types.js';

/**
 * Tracks position in grammar structure tree during parsing.
 * Handles sequences, oneOf alternatives, and cardinality constraints.
 */
export class StructureTracker {
  private structure: StructureNode[];
  private tokens: Record<string, TokenDefinition>;

  // Track match counts for each node path (e.g., "0.2.1" -> count)
  private matchCounts: Map<string, number> = new Map();

  // Current position: index in the root sequence
  private currentIndex: number = 0;

  // Track which oneOf branch was taken at each level
  private oneOfChoices: Map<string, number> = new Map();

  constructor(structure: StructureNode[], tokens: Record<string, TokenDefinition>) {
    this.structure = structure;
    this.tokens = tokens;
  }

  /**
   * Reset tracker to initial state
   */
  reset(): void {
    this.matchCounts.clear();
    this.currentIndex = 0;
    this.oneOfChoices.clear();
  }

  /**
   * Get all token IDs that could match at current position.
   * This considers:
   * - Current position in sequence
   * - Optional elements (can be skipped)
   * - OneOf alternatives (all options valid until one matches)
   * - Cardinality (repeatable elements)
   */
  getExpectedTokenIds(): string[] {
    const expected: string[] = [];
    this._collectExpectedTokens(this.structure, this.currentIndex, '', expected);
    return [...new Set(expected)];
  }

  /**
   * Try to match a token ID at current position.
   * Returns true if matched and position was advanced.
   */
  tryMatch(tokenId: string): boolean {
    return this._tryMatchAtLevel(this.structure, this.currentIndex, '', tokenId);
  }

  /**
   * Collect expected tokens starting from a position in a sequence
   */
  private _collectExpectedTokens(
    nodes: StructureNode[],
    startIndex: number,
    pathPrefix: string,
    result: string[]
  ): void {
    for (let i = startIndex; i < nodes.length; i++) {
      const node = nodes[i];
      const nodePath = pathPrefix ? `${pathPrefix}.${i}` : `${i}`;
      const matchCount = this.matchCounts.get(nodePath) || 0;
      const [minCard, maxCard] = node.cardinality;

      // Check if this node can still accept matches
      const canMatchMore = maxCard === null || matchCount < maxCard;

      if (canMatchMore) {
        // Collect tokens from this node
        this._collectTokensFromNode(node, nodePath, result);
      }

      // If minimum not satisfied, don't look further
      if (matchCount < minCard) {
        break;
      }

      // Otherwise, this node is optional/satisfied, continue to next
    }
  }

  /**
   * Collect token IDs from a single node (handles oneOf, sequence, or token)
   */
  private _collectTokensFromNode(
    node: StructureNode,
    nodePath: string,
    result: string[]
  ): void {
    if (isStructureOneOf(node)) {
      // Check if a choice was already made for this oneOf
      const chosenBranch = this.oneOfChoices.get(nodePath);
      if (chosenBranch !== undefined) {
        // Only collect from the chosen branch
        const child = node.oneOf[chosenBranch];
        this._collectTokensFromNode(child, `${nodePath}.${chosenBranch}`, result);
      } else {
        // No choice made yet - all alternatives are valid
        for (let j = 0; j < node.oneOf.length; j++) {
          const child = node.oneOf[j];
          this._collectTokensFromNode(child, `${nodePath}.${j}`, result);
        }
      }
    } else if (isStructureSequence(node)) {
      // For sequences, collect from current position in sequence
      const seqIndex = this.matchCounts.get(`${nodePath}.seq`) || 0;
      this._collectExpectedTokens(node.sequence, seqIndex, `${nodePath}.s`, result);
    } else {
      // Simple token - add its ID
      result.push(node.id);
    }
  }

  /**
   * Try to match a token at a level, advancing position if successful
   */
  private _tryMatchAtLevel(
    nodes: StructureNode[],
    startIndex: number,
    pathPrefix: string,
    tokenId: string
  ): boolean {
    for (let i = startIndex; i < nodes.length; i++) {
      const node = nodes[i];
      const nodePath = pathPrefix ? `${pathPrefix}.${i}` : `${i}`;
      const matchCount = this.matchCounts.get(nodePath) || 0;
      const [minCard, maxCard] = node.cardinality;

      // Check if this node can accept more matches
      const canMatchMore = maxCard === null || matchCount < maxCard;

      if (canMatchMore) {
        // Try to match this node
        if (this._tryMatchNode(node, nodePath, tokenId)) {
          // Update current index if we're at root level
          if (!pathPrefix) {
            // If node is satisfied, advance to next
            const newCount = (this.matchCounts.get(nodePath) || 0);
            const [newMin, newMax] = node.cardinality;
            if (newCount >= newMin && (newMax !== null && newCount >= newMax)) {
              this.currentIndex = i + 1;
            } else {
              this.currentIndex = i;
            }
          }
          return true;
        }
      }

      // If minimum not satisfied, can't skip this node
      if (matchCount < minCard) {
        break;
      }
    }
    return false;
  }

  /**
   * Try to match a token against a specific node
   */
  private _tryMatchNode(
    node: StructureNode,
    nodePath: string,
    tokenId: string
  ): boolean {
    if (isStructureOneOf(node)) {
      // Try each alternative
      for (let j = 0; j < node.oneOf.length; j++) {
        const child = node.oneOf[j];
        const childPath = `${nodePath}.${j}`;
        if (this._tryMatchNode(child, childPath, tokenId)) {
          // Record which branch was chosen
          this.oneOfChoices.set(nodePath, j);
          // Only increment parent oneOf if child is complete
          // For sequences, check if match count was incremented (indicates sequence complete)
          // For simple tokens or other oneOfs, always increment
          if (isStructureSequence(child)) {
            const childMatchCount = this.matchCounts.get(childPath) || 0;
            if (childMatchCount > 0) {
              this.matchCounts.set(nodePath, (this.matchCounts.get(nodePath) || 0) + 1);
            }
          } else {
            this.matchCounts.set(nodePath, (this.matchCounts.get(nodePath) || 0) + 1);
          }
          return true;
        }
      }
      return false;
    } else if (isStructureSequence(node)) {
      // Try to match within sequence
      const seqIndexKey = `${nodePath}.seq`;
      const seqIndex = this.matchCounts.get(seqIndexKey) || 0;
      if (this._tryMatchAtLevel(node.sequence, seqIndex, `${nodePath}.s`, tokenId)) {
        // Advance sequence position after successful match
        // Find the matched node and check if it's complete
        for (let si = seqIndex; si < node.sequence.length; si++) {
          const seqNode = node.sequence[si];
          const seqNodePath = `${nodePath}.s.${si}`;
          const seqNodeCount = this.matchCounts.get(seqNodePath) || 0;
          const [minCard, maxCard] = seqNode.cardinality;

          // If this node is satisfied (min reached and max reached), advance
          if (seqNodeCount >= minCard && (maxCard !== null && seqNodeCount >= maxCard)) {
            this.matchCounts.set(seqIndexKey, si + 1);
          } else {
            // Stop at first unsatisfied node
            this.matchCounts.set(seqIndexKey, si);
            break;
          }
        }

        // Check if sequence is complete
        const newSeqIndex = this.matchCounts.get(seqIndexKey) || 0;
        if (newSeqIndex >= node.sequence.length) {
          // Sequence complete, increment parent match count
          this.matchCounts.set(nodePath, (this.matchCounts.get(nodePath) || 0) + 1);
        }
        return true;
      }
      return false;
    } else {
      // Simple token - check if ID matches
      if (node.id === tokenId) {
        this.matchCounts.set(nodePath, (this.matchCounts.get(nodePath) || 0) + 1);
        return true;
      }
      // Also check if the token matches this node's pattern
      const tokenDef = this.tokens[node.id];
      if (tokenDef?.pattern) {
        // We're checking tokenId which is already resolved
        // Pattern matching is handled elsewhere
      }
      return false;
    }
  }

  /**
   * Get current position info for debugging
   */
  getDebugInfo(): { currentIndex: number; matchCounts: Record<string, number> } {
    return {
      currentIndex: this.currentIndex,
      matchCounts: Object.fromEntries(this.matchCounts)
    };
  }
}
