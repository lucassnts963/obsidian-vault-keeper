# Conventions — Vault Keeper

## TypeScript

- Strict mode enabled
- No `any` — use proper types or `unknown`
- Interfaces for public APIs, `type` for unions/utilities
- Export default only for the main Plugin class

## File Organization

- `src/main.ts` — Plugin entry (onload/onunload)
- `src/settings.ts` — Types only, no logic
- `src/settings-tab.ts` — UI only
- `src/<module>/<file>.ts` — Feature modules (git, llm, wiki, views)

## Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Plugin class | `VaultKeeperPlugin` | `export default class VaultKeeperPlugin extends Plugin` |
| View classes | `*View` suffix | `InboxView`, `ChatView` |
| View type constants | `UPPER_SNAKE` | `INBOX_VIEW_TYPE = 'vault-keeper-inbox'` |
| Interfaces | PascalCase, no `I` prefix | `LLMProvider`, `GitSettings` |
| Functions | camelCase, verb-first | `ingestFile()`, `updateIndex()` |

## Obsidian API Patterns

```ts
// Registering a view
this.registerView(TYPE, (leaf) => new MyView(leaf, this))

// Activating a view
this.app.workspace.getRightLeaf(false)?.setViewState({ type: TYPE })

// File operations
const content = await this.app.vault.adapter.read(path)
await this.app.vault.adapter.write(path, content)
await this.app.vault.create(path, content)

// Notifications
new Notice('Done!')
```

## LLM Provider Interface

```ts
interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<string>
  models?(): Promise<string[]>
}
```

All providers must implement this. Factory function `createProvider(settings)` returns the right implementation.

## Commit Messages

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `chore:` for build/tooling
