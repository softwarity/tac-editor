/**
 * HTML Template for TAC Editor
 * Monaco-like architecture with virtualized rendering
 */
export function getTemplate(placeholder: string = '', version: string = ''): string {
  return `
    <div class="editor-wrapper">
      <div class="editor-content">
        <div class="placeholder-layer" id="placeholderLayer">${escapeHtml(placeholder)}</div>
        <textarea
          class="hidden-textarea"
          id="hiddenTextarea"
          spellcheck="false"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          tabindex="0"
        ></textarea>
        <div class="viewport" id="viewport">
          <div class="scroll-content" id="scrollContent">
            <div class="lines-container" id="linesContainer"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="suggestions-container" id="suggestionsContainer"></div>
    <div class="status-bar" id="statusBar">
      <span class="status-type" id="statusType"></span>
      <span class="status-info" id="statusInfo"></span>
      <span class="status-version" id="statusVersion" title="@softwarity/tac-editor v${version}">v${version}</span>
    </div>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
