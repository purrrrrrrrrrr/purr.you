<script lang="ts">
  import { onMount } from 'svelte';
  import {
    type Layer, type Group, type LayerTree, type FlatNode,
    scanPage, flattenTree, serializeTree, mergeTree, loadFromStorage, saveToStorage
  } from './editor.js';

  interface Props { active?: boolean; dialStr: string; }
  let { active = $bindable(false), dialStr }: Props = $props();

  let tree = $state<LayerTree>([]);
  const flat = $derived(flattenTree(tree));

  let focusedId = $state<string | null>(null);
  let layersPaneFocused = $state(false);
  let treeDialStr = dialStr;

  function getAllLayers(t: LayerTree): Layer[] {
    return t.flatMap(n => isGroup(n) ? getAllLayers(n.children) : [n]);
  }

  function setSelected(id: string, extend: boolean) {
    const layers = getAllLayers(tree);
    if (!extend) layers.forEach(l => (l.selected = false));
    const target = layers.find(l => l.id === id);
    if (target) target.selected = !target.selected || extend;
    focusedId = id;
  }

  function moveFocus(dir: 1 | -1, extend: boolean) {
    const rows = flat;
    const idx = rows.findIndex(r => r.node.id === focusedId);
    const next = Math.max(0, Math.min(rows.length - 1, (idx === -1 ? 0 : idx) + dir));
    const nextNode = rows[next]?.node;
    if (!nextNode) return;
    if (!isGroup(nextNode)) setSelected(nextNode.id, extend);
    else focusedId = nextNode.id;
  }

  function deselectAll() {
    getAllLayers(tree).forEach(l => (l.selected = false));
    focusedId = null;
  }

  $effect(() => {
    getAllLayers(tree).forEach(l => {
      l.el.style.outline = l.selected ? '2px solid var(--mango)' : '';
      l.el.style.outlineOffset = l.selected ? '2px' : '';
    });
  });

  $effect(() => {
    if (!active) {
      return () => {
        getAllLayers(tree).forEach(l => {
          l.el.style.outline = '';
          l.el.style.outlineOffset = '';
        });
      };
    }
  });

  function buildTree() {
    treeDialStr = dialStr;
    const pageEl = document.querySelector('.page');
    if (!pageEl) return;
    const fresh = scanPage(pageEl);
    const stored = loadFromStorage();
    const saved = stored.pages[dialStr];
    tree = saved ? mergeTree(fresh, saved) : fresh;
  }

  function persist() {
    const allLayers = getAllLayers(tree);
    const stored = loadFromStorage();
    stored.pages[treeDialStr] = serializeTree(tree, allLayers);
    saveToStorage(stored);
  }

  $effect(() => {
    dialStr;
    if (active) buildTree();
    else { tree = []; layersPaneFocused = false; }
  });

  $effect(() => {
    if (!active && tree.length > 0) persist();
  });

  function toggleCollapse(node: Group) {
    node.collapsed = !node.collapsed;
  }

  function collapseFocused() {
    const row = flat.find(r => r.node.id === focusedId);
    if (row && isGroup(row.node)) row.node.collapsed = true;
  }

  function expandFocused() {
    const row = flat.find(r => r.node.id === focusedId);
    if (row && isGroup(row.node)) row.node.collapsed = false;
  }

  function isGroup(node: Layer | Group): node is Group {
    return 'children' in node;
  }

  function groupSelected() {
    const layers = getAllLayers(tree);
    const sel = layers.filter(l => l.selected);
    if (sel.length < 2) return;
    const name = window.prompt('Group name:');
    if (!name) return;
    const selIds = new Set(sel.map(l => l.id));
    const firstIdx = tree.findIndex(n => !isGroup(n) && selIds.has((n as Layer).id));
    if (firstIdx === -1) return;
    const group: Group = { id: `group-${Date.now()}`, name, children: sel, selected: false, collapsed: false };
    const next = tree.filter(n => isGroup(n) || !selIds.has((n as Layer).id));
    next.splice(firstIdx, 0, group);
    sel.forEach(l => (l.selected = false));
    tree = next;
    persist();
  }

  // ── Inspector ──
  const selectedLayer = $derived(getAllLayers(tree).find(l => l.selected) ?? null);

  let inspFlexDir = $state('row');
  let inspAlignItems = $state('flex-start');
  let inspJustifyContent = $state('flex-start');
  let inspPaddingV = $state('');
  let inspPaddingH = $state('');
  let inspFontSize = $state('');
  let inspColor = $state('#000000');
  let inspBgColor = $state('#000000');
  let inspColorEmpty = $state(true);
  let inspBgEmpty = $state(true);

  function toHex(val: string): string {
    if (!val) return '#000000';
    if (val.startsWith('#')) return val;
    const m = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
    return '#000000';
  }

  $effect(() => {
    const el = selectedLayer?.el;
    if (!el) {
      inspFlexDir = 'row';
      inspAlignItems = 'flex-start';
      inspJustifyContent = 'flex-start';
      inspPaddingV = '';
      inspPaddingH = '';
      inspFontSize = '';
      inspColor = '#000000';
      inspBgColor = '#000000';
      inspColorEmpty = true;
      inspBgEmpty = true;
      return;
    }
    const cs = getComputedStyle(el);
    inspFlexDir = el.style.flexDirection || cs.flexDirection || 'row';
    inspAlignItems = el.style.alignItems || cs.alignItems || 'flex-start';
    inspJustifyContent = el.style.justifyContent || cs.justifyContent || 'flex-start';
    inspPaddingV = el.style.paddingTop || '';
    inspPaddingH = el.style.paddingLeft || '';
    inspFontSize = el.style.fontSize || '';
    inspColorEmpty = !el.style.color;
    inspColor = el.style.color ? toHex(el.style.color) : '#000000';
    inspBgEmpty = !el.style.backgroundColor;
    inspBgColor = el.style.backgroundColor ? toHex(el.style.backgroundColor) : '#000000';
  });

  function applyStyle(prop: string, value: string) {
    const el = selectedLayer?.el;
    if (!el) return;
    (el.style as unknown as Record<string, string>)[prop] = value;
  }

  function withPx(val: string): string {
    if (!val) return '';
    return /^\d+(\.\d+)?$/.test(val.trim()) ? val.trim() + 'px' : val.trim();
  }

  // ── Gamepad ──
  let gamepadConnected = $state(false);
  let rafId: number | null = null;
  let prevButtons: boolean[] = [];

  function justPressed(curr: readonly GamepadButton[], i: number): boolean {
    return curr[i]?.pressed === true && !prevButtons[i];
  }

  function pollGamepad() {
    const gp = [...navigator.getGamepads()].find(g => g?.mapping === 'standard') ?? null;
    if (gp) {
      const curr = gp.buttons;
      const ltHeld = curr[6]?.pressed ?? false;
      if (justPressed(curr, 9)) active = !active;
      if (active) {
        if (justPressed(curr, 12)) moveFocus(-1, ltHeld);
        if (justPressed(curr, 13)) moveFocus(1, ltHeld);
        if (justPressed(curr, 0)) {
          const focused = flat.find(r => r.node.id === focusedId);
          if (focused && !isGroup(focused.node)) setSelected(focused.node.id, ltHeld);
        }
        if (justPressed(curr, 1)) deselectAll();
        if (justPressed(curr, 3)) groupSelected();
      }
      prevButtons = Array.from(curr).map(b => b.pressed);
    }
    rafId = requestAnimationFrame(pollGamepad);
  }

  let renamingId = $state<string | null>(null);
  let renameValue = $state('');

  function startRename(node: Group) { renamingId = node.id; renameValue = node.name; }
  function commitRename(node: Group) {
    if (renameValue.trim()) node.name = renameValue.trim();
    renamingId = null;
    persist();
  }
  function commitLayerRename(layer: Layer) {
    if (renameValue.trim()) {
      layer.label = renameValue.trim();
      layer.el.setAttribute('data-layer', layer.label);
    }
    renamingId = null;
    persist();
  }

  function insertAfterNode(nodes: LayerTree, targetId: string, newNode: Layer): boolean {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === targetId) { nodes.splice(i + 1, 0, newNode); return true; }
      if (isGroup(nodes[i])) {
        if (insertAfterNode((nodes[i] as Group).children, targetId, newNode)) return true;
      }
    }
    return false;
  }

  function lastDescendantEl(group: Group): HTMLElement | null {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      if (!isGroup(child)) return child.el;
      const el = lastDescendantEl(child);
      if (el) return el;
    }
    return null;
  }

  function createNode() {
    const pageEl = document.querySelector('.page');
    if (!pageEl) return;
    const newId = `layer-new-${Date.now()}`;
    const newEl = document.createElement('div');
    newEl.style.display = 'flex';
    newEl.setAttribute('data-layer', 'New Layer');
    const newLayer: Layer = { id: newId, label: 'New Layer', el: newEl, depth: 0, selected: false };
    const focusedRow = flat.find(r => r.node.id === focusedId);
    if (!focusedRow) {
      pageEl.appendChild(newEl);
      tree.push(newLayer);
    } else {
      const fn = focusedRow.node;
      if (!isGroup(fn)) fn.el.after(newEl);
      else { const ref = lastDescendantEl(fn); if (ref) ref.after(newEl); else pageEl.appendChild(newEl); }
      if (!insertAfterNode(tree, fn.id, newLayer)) { pageEl.appendChild(newEl); tree.push(newLayer); }
    }
    focusedId = newId;
    renamingId = newId;
    renameValue = 'New Layer';
  }

  function focusOnMount(el: HTMLElement) {
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  }

  function exportJson() {
    const allLayers = getAllLayers(tree);
    const stored = loadFromStorage();
    stored.pages[treeDialStr] = serializeTree(tree, allLayers);
    const blob = new Blob([JSON.stringify(stored, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'purr-layers.json'; a.click();
    URL.revokeObjectURL(url);
  }

  onMount(() => {
    function onKeydown(e: KeyboardEvent) {
      // Shift+Cmd/Ctrl+E — toggle layers pane focus
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (!active) return;
        layersPaneFocused = !layersPaneFocused;
        if (layersPaneFocused && !focusedId && flat.length > 0) {
          focusedId = flat[0].node.id;
        }
        return;
      }

      if (!active) return;

      if (layersPaneFocused) {
        if (e.key === 'ArrowUp')    { e.preventDefault(); moveFocus(-1, e.shiftKey); return; }
        if (e.key === 'ArrowDown')  { e.preventDefault(); moveFocus(1,  e.shiftKey); return; }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); collapseFocused(); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); expandFocused(); return; }
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); createNode(); return; }
        if (e.key === 'Escape') { layersPaneFocused = false; return; }
        if ((e.metaKey || e.ctrlKey) && e.key === 'g') { e.preventDefault(); groupSelected(); return; }
        return;
      }

      if (e.key === 'Escape') { deselectAll(); return; }
      if (e.shiftKey && e.key === 'ArrowUp')   { e.preventDefault(); moveFocus(-1, true); return; }
      if (e.shiftKey && e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1,  true); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') { e.preventDefault(); groupSelected(); }
    }
    window.addEventListener('keydown', onKeydown);

    function onGamepadConnected(e: GamepadEvent) {
      if (e.gamepad.mapping === 'standard') {
        gamepadConnected = true; prevButtons = [];
        if (!rafId) rafId = requestAnimationFrame(pollGamepad);
      }
    }
    function onGamepadDisconnected() { gamepadConnected = false; }

    window.addEventListener('gamepadconnected', onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('gamepadconnected', onGamepadConnected);
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
      if (rafId) cancelAnimationFrame(rafId);
    };
  });
</script>

{#if active}
  <!-- ── Layers panel (left) ── -->
  <div class="editor-layers" class:pane-focused={layersPaneFocused}>
    <div class="editor-header">
      <span class="editor-title" class:title-focused={layersPaneFocused}>LAYERS</span>
      {#if gamepadConnected}<span class="gamepad-dot" title="Gamepad connected">●</span>{/if}
      <button class="editor-close" onclick={() => { persist(); active = false; }}>✕</button>
    </div>
    <div class="editor-body">
      {#each flat as { node, depth } (node.id)}
        <div
          class="layer-row"
          class:selected={node.selected}
          class:is-group={isGroup(node)}
          class:focused={node.id === focusedId}
          style="padding-left: {14 + depth * 16}px"
          onclick={() => { if (!isGroup(node)) setSelected(node.id, false); else focusedId = node.id; }}
        >
          {#if isGroup(node)}
            <button class="collapse-btn" onclick={() => toggleCollapse(node)}>
              {node.collapsed ? '▶' : '▼'}
            </button>
            {#if renamingId === node.id}
              <input
                class="rename-input"
                bind:value={renameValue}
                onblur={() => commitRename(node)}
                onkeydown={(e) => { if (e.key === 'Enter') commitRename(node); if (e.key === 'Escape') renamingId = null; }}
                use:focusOnMount
              />
            {:else}
              <span class="layer-label group-label" ondblclick={() => startRename(node)}>{node.name}</span>
            {/if}
          {:else}
            <span class="layer-indent-icon">—</span>
            {#if renamingId === node.id}
              <input
                class="rename-input"
                bind:value={renameValue}
                onblur={() => commitLayerRename(node)}
                onkeydown={(e) => { if (e.key === 'Enter') commitLayerRename(node); if (e.key === 'Escape') renamingId = null; }}
                use:focusOnMount
              />
            {:else}
              <span class="layer-label">{node.label}</span>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
    <div class="editor-footer">
      <button class="editor-export-btn" onclick={exportJson}>Export JSON</button>
    </div>
  </div>

  <!-- ── Inspector panel (right) ── -->
  <div class="editor-inspector">
    <div class="editor-header">
      <span class="editor-title">INSPECTOR</span>
    </div>

    {#if selectedLayer}
      <div class="insp-body">

        <!-- Flexbox -->
        <div class="insp-section">
          <div class="insp-section-title">FLEXBOX</div>

          <div class="insp-row">
            <span class="insp-label">Direction</span>
            <div class="insp-toggles">
              {#each [['row','→'],['column','↓'],['row-reverse','←'],['column-reverse','↑']] as [v, icon]}
                <button
                  class="toggle-btn"
                  class:on={inspFlexDir === v}
                  title={v}
                  onclick={() => { inspFlexDir = v; applyStyle('flexDirection', v); }}
                >{icon}</button>
              {/each}
            </div>
          </div>

          <div class="insp-row">
            <span class="insp-label">Align</span>
            <div class="insp-toggles">
              {#each [['flex-start','⬆'],['center','⬛'],['flex-end','⬇'],['stretch','↕']] as [v, icon]}
                <button
                  class="toggle-btn"
                  class:on={inspAlignItems === v}
                  title={v}
                  onclick={() => { inspAlignItems = v; applyStyle('alignItems', v); }}
                >{icon}</button>
              {/each}
            </div>
          </div>

          <div class="insp-row">
            <span class="insp-label">Justify</span>
            <div class="insp-toggles">
              {#each [['flex-start','⬅'],['center','↔'],['flex-end','➡'],['space-between','⇔'],['space-around','⟺']] as [v, icon]}
                <button
                  class="toggle-btn"
                  class:on={inspJustifyContent === v}
                  title={v}
                  onclick={() => { inspJustifyContent = v; applyStyle('justifyContent', v); }}
                >{icon}</button>
              {/each}
            </div>
          </div>
        </div>

        <!-- Spacing & Type -->
        <div class="insp-section">
          <div class="insp-section-title">SPACING & TYPE</div>

          <div class="insp-row">
            <span class="insp-label">Pad V</span>
            <input
              class="insp-input"
              type="text"
              placeholder="0px"
              bind:value={inspPaddingV}
              onchange={() => { const v = withPx(inspPaddingV); inspPaddingV = v; applyStyle('paddingTop', v); applyStyle('paddingBottom', v); }}
            />
          </div>

          <div class="insp-row">
            <span class="insp-label">Pad H</span>
            <input
              class="insp-input"
              type="text"
              placeholder="0px"
              bind:value={inspPaddingH}
              onchange={() => { const v = withPx(inspPaddingH); inspPaddingH = v; applyStyle('paddingLeft', v); applyStyle('paddingRight', v); }}
            />
          </div>

          <div class="insp-row">
            <span class="insp-label">Font</span>
            <input
              class="insp-input"
              type="text"
              placeholder="inherit"
              bind:value={inspFontSize}
              onchange={() => { const v = withPx(inspFontSize); inspFontSize = v; applyStyle('fontSize', v); }}
            />
          </div>

          <div class="insp-row">
            <span class="insp-label">Color</span>
            <div class="insp-color-row">
              <input
                class="insp-color"
                type="color"
                value={inspColor}
                oninput={(e) => { inspColor = (e.currentTarget as HTMLInputElement).value; inspColorEmpty = false; applyStyle('color', inspColor); }}
              />
              <button
                class="insp-clear"
                title="Clear"
                onclick={() => { inspColorEmpty = true; inspColor = '#000000'; applyStyle('color', ''); }}
              >✕</button>
            </div>
          </div>

          <div class="insp-row">
            <span class="insp-label">BG</span>
            <div class="insp-color-row">
              <input
                class="insp-color"
                type="color"
                value={inspBgColor}
                oninput={(e) => { inspBgColor = (e.currentTarget as HTMLInputElement).value; inspBgEmpty = false; applyStyle('backgroundColor', inspBgColor); }}
              />
              <button
                class="insp-clear"
                title="Clear"
                onclick={() => { inspBgEmpty = true; inspBgColor = '#000000'; applyStyle('backgroundColor', ''); }}
              >✕</button>
            </div>
          </div>
        </div>

      </div>
    {:else}
      <div class="insp-empty">Select a layer</div>
    {/if}
  </div>
{/if}

<style>
  /* ── Shared panel base ── */
  .editor-layers,
  .editor-inspector {
    position: fixed;
    top: 0;
    width: 220px;
    height: 100vh;
    background: #181818;
    display: flex;
    flex-direction: column;
    z-index: 1000;
    font-family: 'Alexandria', monospace;
  }

  .editor-layers {
    left: 0;
    border-right: 1px solid #2a2a2a;
  }

  .editor-inspector {
    right: 0;
    border-left: 1px solid #2a2a2a;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid #2a2a2a;
    flex-shrink: 0;
  }

  .editor-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #666;
    transition: color 0.15s;
  }

  .editor-title.title-focused {
    color: #fe00ae;
  }

  .editor-layers.pane-focused {
    border-right-color: #fe00ae44;
  }

  .editor-close {
    background: none;
    border: none;
    color: #555;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
  }
  .editor-close:hover { color: var(--mango); }

  /* ── Layers ── */
  .editor-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .layer-row {
    display: flex;
    align-items: center;
    height: 32px;
    gap: 6px;
    cursor: pointer;
    border-left: 2px solid transparent;
    box-sizing: border-box;
    padding-right: 14px;
  }
  .layer-row:hover { background: #222; }
  .layer-row.selected { border-left-color: var(--mango); background: #1e1a00; }
  .layer-row.focused { outline: 1px solid #3a3a3a; outline-offset: -1px; }

  .collapse-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 8px;
    cursor: pointer;
    padding: 0;
    width: 14px;
    flex-shrink: 0;
    line-height: 1;
  }
  .collapse-btn:hover { color: var(--mango); }

  .layer-indent-icon { color: #333; font-size: 10px; flex-shrink: 0; }

  .layer-label {
    font-size: 11px;
    color: #aaa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .layer-row.selected .layer-label { color: var(--mango); }
  .group-label { color: #ccc; font-weight: 600; }

  .editor-footer {
    padding: 10px 14px;
    border-top: 1px solid #2a2a2a;
    flex-shrink: 0;
  }

  .editor-export-btn {
    width: 100%;
    padding: 7px 0;
    background: #222;
    border: 1px solid #333;
    border-radius: 4px;
    color: #aaa;
    font-family: 'Alexandria', monospace;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .editor-export-btn:hover { border-color: var(--mango); color: var(--mango); }

  .gamepad-dot { color: var(--mango); font-size: 8px; margin-right: 4px; }

  .rename-input {
    background: #111;
    border: 1px solid var(--mango);
    border-radius: 2px;
    color: var(--mango);
    font-family: 'Alexandria', monospace;
    font-size: 11px;
    font-weight: 600;
    padding: 1px 4px;
    outline: none;
    width: 100%;
  }

  /* ── Inspector ── */
  .insp-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .insp-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #444;
    letter-spacing: 0.05em;
  }

  .insp-section {
    padding: 10px 0 6px;
    border-bottom: 1px solid #222;
  }

  .insp-section-title {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: #444;
    padding: 0 14px 8px;
  }

  .insp-row {
    display: flex;
    align-items: center;
    padding: 4px 14px;
    gap: 8px;
    min-height: 28px;
  }

  .insp-label {
    font-size: 10px;
    color: #555;
    width: 42px;
    flex-shrink: 0;
    letter-spacing: 0.04em;
  }

  .insp-toggles {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }

  .toggle-btn {
    width: 26px;
    height: 26px;
    background: #222;
    border: 1px solid #2e2e2e;
    border-radius: 3px;
    color: #666;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
  }
  .toggle-btn:hover { background: #2a2a2a; color: #aaa; }
  .toggle-btn.on { background: #2a1f00; border-color: var(--mango); color: var(--mango); }

  .insp-input {
    flex: 1;
    background: #111;
    border: 1px solid #2a2a2a;
    border-radius: 3px;
    color: #ccc;
    font-family: 'Alexandria', monospace;
    font-size: 11px;
    padding: 3px 6px;
    outline: none;
    min-width: 0;
  }
  .insp-input:focus { border-color: var(--mango); }
  .insp-input::placeholder { color: #333; }

  .insp-color-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .insp-color {
    width: 36px;
    height: 26px;
    border: 1px solid #2a2a2a;
    border-radius: 3px;
    background: #111;
    cursor: pointer;
    padding: 1px 2px;
  }
  .insp-color:focus { outline: none; border-color: var(--mango); }

  .insp-clear {
    background: none;
    border: none;
    color: #333;
    font-size: 9px;
    cursor: pointer;
    padding: 2px;
    line-height: 1;
  }
  .insp-clear:hover { color: #888; }
</style>
