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
   * Clear counters for a node and all its descendants (for sequence repetition)
   */
  private _clearNodeCounters(nodePath: string): void {
    // Clear the node's own counter
    this.matchCounts.delete(nodePath);
    // Clear sequence index if present
    this.matchCounts.delete(`${nodePath}.seq`);
    // Clear oneOf choice if present
    this.oneOfChoices.delete(nodePath);

    // Clear any child counters (pattern: nodePath.X where X is a number or 's.X')
    const keysToDelete: string[] = [];
    for (const key of this.matchCounts.keys()) {
      if (key.startsWith(nodePath + '.')) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.matchCounts.delete(key);
    }

    // Also clear oneOf choices for children
    const oneOfKeysToDelete: string[] = [];
    for (const key of this.oneOfChoices.keys()) {
      if (key.startsWith(nodePath + '.')) {
        oneOfKeysToDelete.push(key);
      }
    }
    for (const key of oneOfKeysToDelete) {
      this.oneOfChoices.delete(key);
    }
  }

  // Debug flag - set to true to enable verbose logging
  private _debug = false;

  /**
   * Enable or disable debug mode
   */
  setDebug(enabled: boolean): void {
    this._debug = enabled;
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
    // Start from 0, not currentIndex, to include all elements that can still accept matches
    this._collectExpectedTokens(this.structure, 0, '', expected);
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
   * Check if a node is effectively optional (can be satisfied with 0 matches).
   * This includes:
   * - Nodes with minCard=0
   * - OneOf nodes where ALL children have minCard=0
   * - Sequence nodes where ALL children are effectively optional
   */
  private _isEffectivelyOptional(node: StructureNode): boolean {
    const [minCard] = node.cardinality;

    // Explicitly optional
    if (minCard === 0) {
      return true;
    }

    // For oneOf: check if all alternatives have min=0
    if (isStructureOneOf(node)) {
      return node.oneOf.every(child => {
        const [childMin] = child.cardinality;
        return childMin === 0 || this._isEffectivelyOptional(child);
      });
    }

    // For sequences: check if all elements are effectively optional
    if (isStructureSequence(node)) {
      return node.sequence.every(child => this._isEffectivelyOptional(child));
    }

    // Simple token with minCard > 0 is not optional
    return false;
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

      // Check if this node can still accept matches directly
      const canMatchMore = maxCard === null || matchCount < maxCard;

      // For oneOf/sequence nodes, also check if children can still accept matches
      const hasActiveChildren = this._hasActiveChildren(node, nodePath);

      if (this._debug && nodePath.includes('4.1.s.10')) {
        console.log(`[_collectExpectedTokens] nodePath=${nodePath}, id=${node.id}, matchCount=${matchCount}, cardinality=[${minCard},${maxCard}], canMatchMore=${canMatchMore}, hasActiveChildren=${hasActiveChildren}`);
      }

      if (canMatchMore || hasActiveChildren) {
        // Collect tokens from this node
        this._collectTokensFromNode(node, nodePath, result);
      }

      // If minimum not satisfied, check if effectively optional
      if (matchCount < minCard) {
        // Can skip if effectively optional (e.g., oneOf with all optional children)
        if (!this._isEffectivelyOptional(node)) {
          break;
        }
      }

      // Otherwise, this node is optional/satisfied, continue to next
    }
  }

  /**
   * Check if a node has children that can still accept matches
   */
  private _hasActiveChildren(node: StructureNode, nodePath: string): boolean {
    if (isStructureOneOf(node)) {
      const chosenBranch = this.oneOfChoices.get(nodePath);
      if (chosenBranch !== undefined) {
        const child = node.oneOf[chosenBranch];
        const childPath = `${nodePath}.${chosenBranch}`;
        return this._hasActiveChildren(child, childPath);
      }
      // No choice made yet - all alternatives can potentially accept matches
      // Check if at least one alternative can accept matches
      return node.oneOf.some((child, j) => {
        const childPath = `${nodePath}.${j}`;
        const childMatchCount = this.matchCounts.get(childPath) || 0;
        const [, maxCard] = child.cardinality;
        const canMatchMore = maxCard === null || childMatchCount < maxCard;
        return canMatchMore || this._hasActiveChildren(child, childPath);
      });
    }

    if (isStructureSequence(node)) {
      // First check if the sequence itself can repeat
      const seqMatchCount = this.matchCounts.get(nodePath) || 0;
      const [, seqMaxCard] = node.cardinality;
      const seqCanRepeat = seqMaxCard === null || seqMatchCount < seqMaxCard;

      // If sequence can repeat and has been completed at least once,
      // it can accept new matches (will start a new repetition)
      if (seqCanRepeat && seqMatchCount > 0) {
        return true;
      }

      // Check if any element in the sequence can still accept matches
      for (let i = 0; i < node.sequence.length; i++) {
        const seqNode = node.sequence[i];
        const seqNodePath = `${nodePath}.s.${i}`;
        const seqNodeCount = this.matchCounts.get(seqNodePath) || 0;
        const [, maxCard] = seqNode.cardinality;

        const canMatchMore = maxCard === null || seqNodeCount < maxCard;
        if (canMatchMore) {
          return true;
        }

        // Also check nested structures
        if (this._hasActiveChildren(seqNode, seqNodePath)) {
          return true;
        }
      }
      return false;
    }

    // Simple token - check if it can still accept matches
    const matchCount = this.matchCounts.get(nodePath) || 0;
    const [, maxCard] = node.cardinality;
    return maxCard === null || matchCount < maxCard;
  }

  /**
   * Check if a token could match the first element of a node (ignoring match counts)
   * Used to determine if starting a new repetition is viable
   */
  private _couldMatchFirstElement(node: StructureNode, tokenId: string): boolean {
    if (isStructureOneOf(node)) {
      // Check all alternatives
      return node.oneOf.some(child => this._couldMatchFirstElement(child, tokenId));
    } else if (isStructureSequence(node)) {
      // Check only the first element
      if (node.sequence.length > 0) {
        return this._couldMatchFirstElement(node.sequence[0], tokenId);
      }
      return false;
    } else {
      // Simple token - check if ID matches
      return node.id === tokenId;
    }
  }

  /**
   * Collect tokens from the first element of a node (ignoring match counts)
   * Used for collecting tokens that could start a new repetition
   */
  private _collectFirstTokensFromNode(
    node: StructureNode,
    result: string[]
  ): void {
    if (isStructureOneOf(node)) {
      // For oneOf, all alternatives are valid to start
      for (let j = 0; j < node.oneOf.length; j++) {
        this._collectFirstTokensFromNode(node.oneOf[j], result);
      }
    } else if (isStructureSequence(node)) {
      // For sequence, only collect from first element
      if (node.sequence.length > 0) {
        this._collectFirstTokensFromNode(node.sequence[0], result);
      }
    } else {
      // Simple token - add its ID
      result.push(node.id);
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
      const matchCount = this.matchCounts.get(nodePath) || 0;
      const [, maxCard] = node.cardinality;
      const canRepeat = maxCard === null || matchCount < maxCard;

      if (this._debug && nodePath.includes('4.1.s.10')) {
        console.log(`[_collectTokensFromNode] oneOf nodePath=${nodePath}, id=${node.id}, chosenBranch=${chosenBranch}, matchCount=${matchCount}, canRepeat=${canRepeat}`);
      }
      if (chosenBranch !== undefined) {
        // Collect from the chosen branch (for continuing current match)
        const child = node.oneOf[chosenBranch];
        this._collectTokensFromNode(child, `${nodePath}.${chosenBranch}`, result);

        // If oneOf can repeat and has been matched at least once,
        // also include tokens from ALL alternatives for a new repetition
        if (canRepeat && matchCount > 0) {
          if (this._debug && nodePath.includes('4.1.s.10')) {
            console.log(`[_collectTokensFromNode] oneOf can repeat, including all alternatives`);
          }
          for (let j = 0; j < node.oneOf.length; j++) {
            const altChild = node.oneOf[j];
            // Use a fresh path for collecting first-element tokens
            this._collectFirstTokensFromNode(altChild, result);
          }
        }
      } else {
        // No choice made yet - all alternatives are valid
        for (let j = 0; j < node.oneOf.length; j++) {
          const child = node.oneOf[j];
          this._collectTokensFromNode(child, `${nodePath}.${j}`, result);
        }
      }
    } else if (isStructureSequence(node)) {
      if (this._debug && nodePath.includes('4.1.s.10')) {
        console.log(`[_collectTokensFromNode] sequence nodePath=${nodePath}, id=${node.id}, seqLength=${node.sequence.length}`);
      }
      // For sequences, collect from ALL elements that can still accept matches
      // Don't use seqIndex - it may have advanced past optional elements
      this._collectExpectedTokens(node.sequence, 0, `${nodePath}.s`, result);

      // For repeatable sequences that have completed at least once,
      // also include tokens from the FIRST element to allow starting a new repetition
      const seqMatchCount = this.matchCounts.get(nodePath) || 0;
      const [, seqMaxCard] = node.cardinality;
      const seqCanRepeat = seqMaxCard === null || seqMatchCount < seqMaxCard;

      if (seqCanRepeat && seqMatchCount > 0 && node.sequence.length > 0) {
        // Include tokens from first element for a potential new repetition
        // Use _collectFirstTokensFromNode to ignore current state (since new repetition resets counters)
        const firstNode = node.sequence[0];
        if (this._debug && nodePath.includes('4.1.s.10')) {
          console.log(`[_collectTokensFromNode] sequence can repeat, including first element for new repetition`);
        }
        this._collectFirstTokensFromNode(firstNode, result);
      }
    } else {
      // Simple token - add its ID
      if (this._debug && nodePath.includes('4.1.s.10')) {
        console.log(`[_collectTokensFromNode] token nodePath=${nodePath}, id=${node.id}`);
      }
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
    // Also try from index 0 to catch matches in nodes that have active children
    const indicesToTry = startIndex === 0 ? [0] : [startIndex, 0];

    for (const start of indicesToTry) {
      for (let i = start; i < nodes.length; i++) {
        const node = nodes[i];
        const nodePath = pathPrefix ? `${pathPrefix}.${i}` : `${i}`;
        const matchCount = this.matchCounts.get(nodePath) || 0;
        const [minCard, maxCard] = node.cardinality;

        // Check if this node can accept more matches
        const canMatchMore = maxCard === null || matchCount < maxCard;
        // Also check if children can accept matches
        const hasActiveChildren = this._hasActiveChildren(node, nodePath);

        if (canMatchMore || hasActiveChildren) {
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

        // If minimum not satisfied, check if we can skip this node
        if (matchCount < minCard) {
          // Can skip if effectively optional (e.g., oneOf with all optional children)
          if (!this._isEffectivelyOptional(node)) {
            break;
          }
        }
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
        // Track child's match count before attempting match
        const childMatchCountBefore = this.matchCounts.get(childPath) || 0;
        if (this._tryMatchNode(child, childPath, tokenId)) {
          // Record which branch was chosen
          this.oneOfChoices.set(nodePath, j);
          // Only increment parent oneOf if child transitioned from incomplete to complete
          // For sequences, check if match count was incremented (indicates new completion)
          // For simple tokens or other oneOfs, always increment
          if (isStructureSequence(child)) {
            const childMatchCountAfter = this.matchCounts.get(childPath) || 0;
            // Only increment if child just completed (count went from 0 to 1)
            if (childMatchCountAfter > childMatchCountBefore) {
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
      let seqIndex = this.matchCounts.get(seqIndexKey) || 0;

      // Check if we need to start a new repetition of the sequence
      // This happens when the sequence was already completed but can repeat
      const currentMatchCount = this.matchCounts.get(nodePath) || 0;
      const [, maxCard] = node.cardinality;
      const canRepeat = maxCard === null || currentMatchCount < maxCard;

      // Helper to reset sequence for new repetition
      const resetForNewRepetition = () => {
        this.matchCounts.set(seqIndexKey, 0);
        seqIndex = 0;
        for (let si = 0; si < node.sequence.length; si++) {
          this._clearNodeCounters(`${nodePath}.s.${si}`);
        }
      };

      // Case 1: seqIndex past end of sequence
      if (seqIndex >= node.sequence.length && canRepeat && currentMatchCount > 0) {
        resetForNewRepetition();
      }

      // Try to match at current position first
      if (this._tryMatchAtLevel(node.sequence, seqIndex, `${nodePath}.s`, tokenId)) {
        // Advance sequence position after successful match
        // Only advance past elements that are fully complete AND have no active children
        for (let si = seqIndex; si < node.sequence.length; si++) {
          const seqNode = node.sequence[si];
          const seqNodePath = `${nodePath}.s.${si}`;
          const seqNodeCount = this.matchCounts.get(seqNodePath) || 0;
          const [, maxCard] = seqNode.cardinality;

          // Only advance past nodes that are complete (max reached)
          const isComplete = maxCard !== null && seqNodeCount >= maxCard;

          // Also check if the node has children that can still accept matches
          // (e.g., trendConditions may be "complete" but trendCloud inside can still accept more)
          const hasActive = this._hasActiveChildren(seqNode, seqNodePath);

          if (isComplete && !hasActive) {
            // Fully complete with no active children - advance past this element
            this.matchCounts.set(seqIndexKey, si + 1);
          } else if (seqNodeCount > 0) {
            // Node has matches but not fully complete or has active children - stay here
            this.matchCounts.set(seqIndexKey, si);
            break;
          } else {
            // Node has no matches - don't advance, but continue checking
            // to find if there's a matched node after this one
            continue;
          }
        }

        // Check if sequence is complete (all required elements satisfied)
        // Only increment sequence matchCount if it wasn't already complete
        const currentSeqMatchCount = this.matchCounts.get(nodePath) || 0;
        const wasComplete = currentSeqMatchCount > 0;

        // Check if all non-optional elements are complete
        let allRequiredComplete = true;
        for (let si = 0; si < node.sequence.length; si++) {
          const seqNode = node.sequence[si];
          const seqNodePath = `${nodePath}.s.${si}`;
          const seqNodeCount = this.matchCounts.get(seqNodePath) || 0;
          const [minCard, maxCard] = seqNode.cardinality;

          if (minCard > 0 && !this._isEffectivelyOptional(seqNode)) {
            const isComplete = maxCard !== null && seqNodeCount >= maxCard;
            if (!isComplete) {
              allRequiredComplete = false;
              break;
            }
          }
        }

        // Only increment if transitioning from incomplete to complete
        if (allRequiredComplete && !wasComplete) {
          this.matchCounts.set(nodePath, 1);
        }
        return true;
      }

      // Case 2: Match failed at current position, but sequence can repeat
      // Try again with a fresh start if sequence has been completed at least once
      if (canRepeat && currentMatchCount > 0 && seqIndex > 0) {
        // Check if token could match first element with fresh counters
        const firstNode = node.sequence[0];
        if (this._couldMatchFirstElement(firstNode, tokenId)) {
          // Reset for new repetition and try again
          resetForNewRepetition();
          if (this._tryMatchAtLevel(node.sequence, 0, `${nodePath}.s`, tokenId)) {
            // After successful match in new repetition, advance sequence position
            for (let si = 0; si < node.sequence.length; si++) {
              const seqNode = node.sequence[si];
              const seqNodePath = `${nodePath}.s.${si}`;
              const seqNodeCount = this.matchCounts.get(seqNodePath) || 0;
              const [, maxCard] = seqNode.cardinality;
              const isComplete = maxCard !== null && seqNodeCount >= maxCard;
              const hasActive = this._hasActiveChildren(seqNode, seqNodePath);

              if (isComplete && !hasActive) {
                this.matchCounts.set(seqIndexKey, si + 1);
              } else if (seqNodeCount > 0) {
                this.matchCounts.set(seqIndexKey, si);
                break;
              }
            }
            return true;
          }
        }
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
