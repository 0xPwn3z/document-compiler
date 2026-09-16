const landing = document.querySelector('#landing');
const workspace = document.querySelector('#workspace');
const fileInput = document.querySelector('#file-input');
const dropzone = document.querySelector('#dropzone');
const uploadError = document.querySelector('#upload-error');
const editor = document.querySelector('#markdown-editor');
const preview = document.querySelector('#preview');
const saveStatus = document.querySelector('#save-status');
const wordCount = document.querySelector('#word-count');
const message = document.querySelector('#workspace-message');
let project = null;
let saveTimer = null;

fileInput.addEventListener('change', () => fileInput.files[0] && upload(fileInput.files[0]));
['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('dragging'); }));
dropzone.addEventListener('drop', event => event.dataTransfer.files[0] && upload(event.dataTransfer.files[0]));
document.querySelector('#save-button').addEventListener('click', save);
document.querySelector('#export-button').addEventListener('click', exportDocx);
editor.addEventListener('input', () => { saveStatus.textContent = 'modifiche non salvate'; render(); scheduleSave(); });
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && project) { event.preventDefault(); save(); } });

/* ---------- Find & replace (i marker dc:* sono mai toccati, vedi find-replace.js) ---------- */

const findBar = document.querySelector('#find-bar');
const findInput = document.querySelector('#find-input');
const replaceInput = document.querySelector('#replace-input');
const findCase = document.querySelector('#find-case');
const findWhole = document.querySelector('#find-whole');
const findCount = document.querySelector('#find-count');
let findState = { matches: [], index: -1 };

function findOptions() { return { find: findInput.value, caseSensitive: findCase.checked, wholeWord: findWhole.checked }; }

function refreshMatches() {
  findState.matches = ReplaceMarkdown.findMatches(editor.value, findOptions());
  if (findState.index >= findState.matches.length) findState.index = findState.matches.length - 1;
  const total = findState.matches.length;
  findInput.classList.toggle('no-match', Boolean(findInput.value) && total === 0);
  findCount.textContent = !findInput.value ? '' : total ? `${findState.index + 1}/${total}` : 'nessun risultato';
}

function selectMatch(index) {
  const match = findState.matches[index];
  if (!match) return;
  findState.index = index;
  editor.setSelectionRange(match.start, match.end);
  const line = editor.value.slice(0, match.start).split('\n').length;
  editor.scrollTop = Math.max(0, (line - 6) * (parseFloat(getComputedStyle(editor).lineHeight) || 23));
  refreshMatches();
}

function stepMatch(delta) {
  if (!findState.matches.length) return;
  selectMatch((findState.index + delta + findState.matches.length) % findState.matches.length);
}

function openFind() {
  findBar.hidden = false;
  const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (selection && !selection.includes('\n')) findInput.value = selection;
  findInput.focus();
  findInput.select();
  findState.index = -1;
  refreshMatches();
}

function closeFind() { findBar.hidden = true; editor.focus(); }

function replaceCurrent() {
  const { find, caseSensitive, wholeWord } = findOptions();
  if (!find || !findState.matches.length) return;
  const matches = ReplaceMarkdown.findMatches(editor.value, { find, caseSensitive, wholeWord });
  const caret = editor.selectionStart;
  const current = matches.find(m => m.start >= caret) || matches[0];
  editor.value = editor.value.slice(0, current.start) + replaceInput.value + editor.value.slice(current.end);
  editor.dispatchEvent(new Event('input'));
  const next = ReplaceMarkdown.findMatches(editor.value, { find, caseSensitive, wholeWord });
  findState.matches = next;
  const following = next.find(m => m.start >= current.start + replaceInput.value.length) || next[0];
  findState.index = next.indexOf(following);
  if (following) selectMatch(findState.index);
  refreshMatches();
}

function replaceEverywhere() {
  const options = { ...findOptions(), replace: replaceInput.value };
  if (!options.find) return;
  const outcome = ReplaceMarkdown.replaceInMarkdown(editor.value, options);
  if (!outcome.count) { refreshMatches(); return; }
  editor.value = outcome.result;
  editor.dispatchEvent(new Event('input'));
  showMessage(`Sostituite ${outcome.count} occorrenze di "${options.find}".`);
  findState.index = -1;
  refreshMatches();
}

findInput.addEventListener('input', () => { findState.index = -1; refreshMatches(); if (findState.matches.length) selectMatch(0); });
findCase.addEventListener('change', () => { findState.index = -1; refreshMatches(); if (findState.matches.length) selectMatch(0); });
findWhole.addEventListener('change', () => { findState.index = -1; refreshMatches(); if (findState.matches.length) selectMatch(0); });
findInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); stepMatch(event.shiftKey ? -1 : 1); }
  if (event.key === 'Escape') closeFind();
});
replaceInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); replaceCurrent(); }
  if (event.key === 'Escape') closeFind();
});
document.querySelector('#find-next').addEventListener('click', () => stepMatch(1));
document.querySelector('#find-prev').addEventListener('click', () => stepMatch(-1));
document.querySelector('#find-close').addEventListener('click', closeFind);
document.querySelector('#replace-one').addEventListener('click', replaceCurrent);
document.querySelector('#replace-all').addEventListener('click', replaceEverywhere);
editor.addEventListener('keydown', event => {
  if (findBar.hidden) return;
  if (event.key === 'Escape') closeFind();
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); stepMatch(event.shiftKey ? -1 : 1); }
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && project && workspace.hidden === false) {
    event.preventDefault();
    openFind();
  }
});
editor.addEventListener('input', () => { if (!findBar.hidden) { const at = findState.index; refreshMatches(); if (findState.matches.length && at >= 0) selectMatch(Math.min(at, findState.matches.length - 1)); } });

async function upload(file) {
  clearError();
  if (!file.name.toLowerCase().endsWith('.docx')) return showError('Seleziona un file .docx.');
  const form = new FormData(); form.append('file', file, file.name);
  dropzone.querySelector('strong').textContent = 'Sto leggendo il template…';
  try {
    const response = await fetch('/api/projects', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Upload non riuscito.');
    project = data; openWorkspace();
  } catch (error) { showError(error.message); }
  finally { dropzone.querySelector('strong').textContent = 'Trascina qui il template DOCX'; }
}

function openWorkspace() {
  landing.hidden = true; workspace.hidden = false;
  document.querySelector('#project-name').textContent = project.name;
  document.querySelector('#project-meta').textContent = `${project.source_filename} · ${project.manifest.editable_blocks.length} blocchi editabili`;
  editor.value = project.markdown; render();
  const limitations = project.manifest.limitations || [];
  document.querySelector('#limitations').innerHTML = limitations.length ? `<strong>Nota:</strong> ${escapeHtml(limitations.join(' '))}` : '';
}

async function save() {
  if (!project) return;
  saveStatus.textContent = 'salvataggio…';
  try {
    const response = await fetch(`/api/projects/${project.id}/markdown`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ markdown: editor.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Salvataggio non riuscito.');
    project = data; saveStatus.textContent = 'salvato';
  } catch (error) { saveStatus.textContent = 'errore'; showMessage(error.message, true); }
}

function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 1000); }

async function exportDocx() {
  if (!project) return;
  const button = document.querySelector('#export-button'); button.disabled = true; button.innerHTML = 'Genero DOCX…';
  try {
    const response = await fetch(`/api/projects/${project.id}/export`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ markdown: editor.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Esportazione non riuscita.');
    const link = document.createElement('a'); link.href = data.download_url; link.download = `${project.name}.docx`; link.click();
    showMessage(data.warnings?.length ? `DOCX generato con note: ${data.warnings.join(' ')}` : 'DOCX generato dal template originale.');
    project.has_export = true;
  } catch (error) { showMessage(error.message, true); }
  finally { button.disabled = false; button.innerHTML = 'Esporta DOCX <span class="button-icon">↓</span>'; }
}

function render() {
  const source = editor.value.replace(/^\s*<!--.*?-->\s*$/gm, '').trim();
  const lines = source.split(/\n/); let html = ''; let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim(); if (!line) { i++; continue; }
    if (line.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const rows = []; rows.push(splitRow(line)); i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitRow(lines[i])); i++; }
      html += '<table><thead><tr>' + rows[0].map(cell => `<th>${inline(cell)}</th>`).join('') + '</tr></thead><tbody>' + rows.slice(1).map(row => '<tr>' + row.map(cell => `<td>${inline(cell)}</td>`).join('') + '</tr>').join('') + '</tbody></table>'; continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/); if (heading) { html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`; i++; continue; }
    const fence = line.match(/^```/); if (fence) { i++; const code = []; while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]); i++; html += `<pre>${escapeHtml(code.join('\n'))}</pre>`; continue; }
    const list = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/); if (list) { const ordered = /^\d/.test(list[1]); const items = []; while (i < lines.length) { const item = lines[i].match(/^\s*([-*+]|\d+\.)\s+(.*)$/); if (!item) break; items.push(`<li>${inline(item[2])}</li>`); i++; } html += `<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`; continue; }
    const paragraph = [line]; i++; while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+/.test(lines[i]) && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])) paragraph.push(lines[i++].trim()); html += `<p>${inline(paragraph.join(' '))}</p>`;
  }
  preview.innerHTML = html || '<p class="muted">La preview apparirà qui mentre scrivi.</p>';
  const words = editor.value.trim() ? editor.value.trim().split(/\s+/).length : 0; wordCount.textContent = `${words.toLocaleString('it-IT')} parole`;
}

function splitRow(line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.replaceAll('\\|', '|').trim()); }
function inline(value) { return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/_(.+?)_/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/&lt;br&gt;/gi, '<br>'); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char])); }
function showError(text) { uploadError.textContent = text; uploadError.hidden = false; }
function clearError() { uploadError.hidden = true; uploadError.textContent = ''; }
function showMessage(text, warning = false) { message.textContent = text; message.classList.toggle('warning', warning); message.hidden = false; setTimeout(() => { message.hidden = true; }, 7000); }

