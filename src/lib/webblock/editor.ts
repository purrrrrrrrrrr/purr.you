export type Layer = {
  id: string
  label: string
  el: HTMLElement
  depth: number
  selected: boolean
}

export type Group = {
  id: string
  name: string
  children: (Layer | Group)[]
  selected: boolean
  collapsed: boolean
}

export type LayerTree = (Layer | Group)[]

export type FlatNode = {
  node: Layer | Group
  depth: number
}

export type SavedNode =
  | { type: 'layer'; index: number; label: string }
  | { type: 'group'; name: string; children: SavedNode[] }

export type SavedTree = {
  version: 1
  pages: Record<string, SavedNode[]>
}

const LS_KEY = 'purr-editor-tree'

function labelFromEl(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const cls = el.classList[0] ?? ''
  return cls ? `${tag}.${cls}` : tag
}

export function scanPage(pageEl: Element): LayerTree {
  return Array.from(pageEl.children).map((child, i) => {
    const el = child as HTMLElement
    const label = el.dataset['layer'] ?? labelFromEl(el)
    return { id: `layer-${i}`, label, el, depth: 0, selected: false } satisfies Layer
  })
}

export function flattenTree(tree: LayerTree, depth = 0): FlatNode[] {
  return tree.flatMap((node): FlatNode[] => {
    const row: FlatNode = { node, depth }
    if ('children' in node && !node.collapsed) {
      return [row, ...flattenTree(node.children, depth + 1)]
    }
    return [row]
  })
}

export function serializeTree(tree: LayerTree, allLayers: Layer[]): SavedNode[] {
  return tree.map((node): SavedNode => {
    if ('children' in node) {
      return { type: 'group', name: node.name, children: serializeTree(node.children, allLayers) }
    }
    const index = allLayers.findIndex(l => l.id === node.id)
    return { type: 'layer', index, label: node.label }
  })
}

export function mergeTree(fresh: LayerTree, saved: SavedNode[]): LayerTree {
  const flatFresh = fresh as Layer[]

  function rebuild(nodes: SavedNode[]): LayerTree {
    return nodes.flatMap((s): (Layer | Group)[] => {
      if (s.type === 'layer') {
        const layer = flatFresh[s.index]
        if (!layer) return []
        return [{ ...layer, label: s.label }]
      }
      return [{
        id: `group-${Math.random().toString(36).slice(2)}`,
        name: s.name,
        children: rebuild(s.children),
        selected: false,
        collapsed: false,
      }]
    })
  }

  return rebuild(saved)
}

export function loadFromStorage(): SavedTree {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { version: 1, pages: {} }
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1 || typeof parsed?.pages !== 'object' || parsed.pages === null) {
      return { version: 1, pages: {} }
    }
    return parsed as SavedTree
  } catch {
    return { version: 1, pages: {} }
  }
}

export function saveToStorage(data: SavedTree): void {
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}
