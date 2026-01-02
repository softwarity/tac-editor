/**
 * HTML Template for TAC Editor
 * Monaco-like architecture with virtualized rendering
 */
export function getTemplate(placeholder: string = '', version: string = ''): string {
  return `
    <div class="header-bar" id="headerBar">
      <span class="header-type" id="headerType">TAC</span>
      <span class="header-spacer"></span>
      <button class="info-btn" id="infoBtn" title="About" aria-label="About">ⓘ</button>
    </div>
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
    <div class="footer-bar" id="footerBar">
      <span class="footer-info" id="footerInfo"></span>
      <button class="footer-clear" id="clearBtn" title="Clear" aria-label="Clear" tabindex="-1">✕</button>
    </div>
    <div class="info-popup" id="infoPopup">
      <div class="info-popup-content">
        <div class="info-popup-title">TAC Editor</div>
        <a class="info-popup-version" href="https://www.npmjs.com/package/@softwarity/tac-editor/v/${version}" target="_blank" rel="noopener">v${version}</a>
        <div class="info-popup-copyright">© ${new Date().getFullYear()} Softwarity</div>
      </div>
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
