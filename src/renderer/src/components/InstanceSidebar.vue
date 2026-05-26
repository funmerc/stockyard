<script setup lang="ts">
import { reactive, ref } from 'vue'
import type {
  CloudflareAccount,
  ConnectionSummary,
  ConsoleTarget,
  DatabaseDescriptor,
  DatabaseRef
} from '../../../shared/types'
import { useConnections } from '../composables/useConnections'
import DbList from './DbList.vue'
import ContextMenu from './ContextMenu.vue'

const emit = defineEmits<{
  select: [{ ref: DatabaseRef; table: string }]
  add: []
  console: [ConsoleTarget]
}>()

const { connections, remove, refresh } = useConnections()

const expandedConns = reactive(new Set<string>())

// Right-click menus for a connection (root) node and an account node.
const connMenu = ref<{ x: number; y: number; id: string }>()
const acctMenu = ref<{ x: number; y: number; connectionId: string; accountId: string }>()

// Remote-only: accounts under a connection.
const accountsCache = reactive<Record<string, CloudflareAccount[]>>({})
const accountsLoading = reactive(new Set<string>())
const accountsError = reactive<Record<string, string>>({})
const expandedAccounts = reactive(new Set<string>())

// Databases per scope. scopeKey = connId (local) or `${connId}/${accountId}` (remote).
const dbCache = reactive<Record<string, DatabaseDescriptor[]>>({})
const dbLoading = reactive(new Set<string>())
const dbError = reactive<Record<string, string>>({})

const selectedKey = ref<string>()

const acctKey = (connId: string, accountId: string): string => `${connId}/${accountId}`

// Cloudflare names personal accounts "<email>'s Account"; show just the email.
// Team/org names that don't match the pattern are left as-is.
const accountLabel = (name: string): string => name.replace(/[’']s\s+account$/i, '')

// A connection is "loading" while fetching its first child level.
const isConnLoading = (conn: ConnectionSummary): boolean =>
  conn.type === 'remote' ? accountsLoading.has(conn.id) : dbLoading.has(conn.id)

async function loadDatabases(scopeKey: string, connId: string, accountId?: string): Promise<void> {
  if (dbCache[scopeKey] || dbLoading.has(scopeKey)) return
  dbLoading.add(scopeKey)
  delete dbError[scopeKey]
  try {
    dbCache[scopeKey] = await window.api.data.listDatabases(connId, accountId)
  } catch (error) {
    dbError[scopeKey] = error instanceof Error ? error.message : String(error)
  } finally {
    dbLoading.delete(scopeKey)
  }
}

async function loadAccounts(connId: string): Promise<void> {
  if (accountsCache[connId] || accountsLoading.has(connId)) return
  accountsLoading.add(connId)
  delete accountsError[connId]
  try {
    accountsCache[connId] = await window.api.data.listAccounts(connId)
  } catch (error) {
    accountsError[connId] = error instanceof Error ? error.message : String(error)
  } finally {
    accountsLoading.delete(connId)
  }
}

function toggleConn(conn: ConnectionSummary): void {
  if (expandedConns.has(conn.id)) {
    expandedConns.delete(conn.id)
    return
  }
  expandedConns.add(conn.id)
  if (conn.type === 'remote') void loadAccounts(conn.id)
  else void loadDatabases(conn.id, conn.id)
}

function toggleAccount(connId: string, account: CloudflareAccount): void {
  const key = acctKey(connId, account.id)
  if (expandedAccounts.has(key)) {
    expandedAccounts.delete(key)
    return
  }
  expandedAccounts.add(key)
  void loadDatabases(key, connId, account.id)
}

function onSelect(payload: { ref: DatabaseRef; table: string }): void {
  const { ref, table } = payload
  const dbScope = `${ref.connectionId}:${ref.kind === 'remote' ? ref.databaseId : ref.filePath}`
  selectedKey.value = `${dbScope}/${table}`
  emit('select', payload)
}

function openConnMenu(event: MouseEvent, conn: ConnectionSummary): void {
  connMenu.value = { x: event.clientX, y: event.clientY, id: conn.id }
}

async function onConnMenuSelect(id: string): Promise<void> {
  if (id === 'remove' && connMenu.value) await remove(connMenu.value.id)
}

function openAcctMenu(event: MouseEvent, connectionId: string, accountId: string): void {
  acctMenu.value = { x: event.clientX, y: event.clientY, connectionId, accountId }
}

function onAcctMenuSelect(id: string): void {
  if (id === 'console' && acctMenu.value) {
    emit('console', {
      scope: 'account',
      connectionId: acctMenu.value.connectionId,
      accountId: acctMenu.value.accountId
    })
  }
}

// Collapse the whole tree and re-fetch from scratch (lazy children reload on expand).
async function collapseAndRefresh(): Promise<void> {
  selectedKey.value = undefined
  expandedConns.clear()
  expandedAccounts.clear()
  for (const key of Object.keys(accountsCache)) delete accountsCache[key]
  for (const key of Object.keys(accountsError)) delete accountsError[key]
  for (const key of Object.keys(dbCache)) delete dbCache[key]
  for (const key of Object.keys(dbError)) delete dbError[key]
  await refresh()
}

defineExpose({ collapseAndRefresh })
</script>

<template>
  <nav class="sidebar">
    <div class="sidebar-head">
      <span class="head-title">Connections</span>
      <button
        class="icon-btn"
        title="Add connection"
        aria-label="Add connection"
        @click="$emit('add')"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>

    <div class="tree-wrap">
      <ul v-if="connections.length" class="tree">
        <li v-for="conn in connections" :key="conn.id">
          <button
            class="row conn"
            @click="toggleConn(conn)"
            @contextmenu.prevent="openConnMenu($event, conn)"
          >
            <span class="chevron" :class="{ open: expandedConns.has(conn.id) }">›</span>
            <span class="name">{{ conn.label }}</span>
            <span v-if="isConnLoading(conn)" class="spinner" />
            <span class="badge" :class="conn.type">{{
              conn.type === 'remote' ? 'remote' : 'local'
            }}</span>
          </button>

          <div v-if="expandedConns.has(conn.id)" class="children">
            <!-- Remote: accounts → databases → tables -->
            <template v-if="conn.type === 'remote'">
              <div v-if="accountsError[conn.id]" class="row error" :title="accountsError[conn.id]">
                {{ accountsError[conn.id] }}
              </div>
              <template v-for="acct in accountsCache[conn.id] ?? []" :key="acct.id">
                <button
                  class="row account"
                  @click="toggleAccount(conn.id, acct)"
                  @contextmenu.prevent="openAcctMenu($event, conn.id, acct.id)"
                >
                  <span
                    class="chevron"
                    :class="{ open: expandedAccounts.has(acctKey(conn.id, acct.id)) }"
                  >
                    ›
                  </span>
                  <span class="name">{{ accountLabel(acct.name) }}</span>
                  <span v-if="dbLoading.has(acctKey(conn.id, acct.id))" class="spinner" />
                </button>
                <div v-if="expandedAccounts.has(acctKey(conn.id, acct.id))">
                  <div
                    v-if="dbError[acctKey(conn.id, acct.id)]"
                    class="row error"
                    :title="dbError[acctKey(conn.id, acct.id)]"
                  >
                    {{ dbError[acctKey(conn.id, acct.id)] }}
                  </div>
                  <div
                    v-else-if="dbCache[acctKey(conn.id, acct.id)]?.length === 0"
                    class="row muted"
                  >
                    No databases
                  </div>
                  <DbList
                    :databases="dbCache[acctKey(conn.id, acct.id)] ?? []"
                    :selected-key="selectedKey"
                    @select="onSelect"
                    @console="$emit('console', $event)"
                  />
                </div>
              </template>
            </template>

            <!-- Local: databases → tables -->
            <template v-else>
              <div v-if="dbError[conn.id]" class="row error" :title="dbError[conn.id]">
                {{ dbError[conn.id] }}
              </div>
              <div v-else-if="dbCache[conn.id]?.length === 0" class="row muted">
                No local databases
              </div>
              <DbList
                :databases="dbCache[conn.id] ?? []"
                :selected-key="selectedKey"
                @select="onSelect"
                @console="$emit('console', $event)"
              />
            </template>
          </div>
        </li>
      </ul>
      <p v-else class="empty-note">No connections.</p>
    </div>

    <ContextMenu
      v-if="connMenu"
      :x="connMenu.x"
      :y="connMenu.y"
      :items="[{ id: 'remove', label: 'Remove connection', danger: true }]"
      @select="onConnMenuSelect"
      @close="connMenu = undefined"
    />

    <ContextMenu
      v-if="acctMenu"
      :x="acctMenu.x"
      :y="acctMenu.y"
      :items="[{ id: 'console', label: 'Console' }]"
      @select="onAcctMenuSelect"
      @close="acctMenu = undefined"
    />
  </nav>
</template>

<style scoped>
.sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-background-soft);
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 6px 8px 6px 14px;
  border-bottom: 1px solid var(--ev-c-gray-3);
}
.head-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--ev-c-text-3);
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid transparent;
  color: var(--ev-c-text-2);
  background: none;
  border-radius: 6px;
  padding: 4px;
}
.icon-btn:hover {
  color: var(--color-text);
  background: var(--color-background-mute);
}
.tree-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0;
}
.tree {
  margin: 0;
  padding: 0;
}
.empty-note {
  padding: 14px;
  color: var(--ev-c-text-3);
  font-size: 13px;
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 14px;
  padding: 6px 20px 6px 14px;
  cursor: pointer;
}
.row:hover {
  background: var(--color-background-mute);
}
.row.conn {
  font-weight: 600;
}
.row.account {
  padding-left: 28px;
  color: var(--ev-c-text-1);
}
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  border-radius: 7px;
  padding: 1px 6px;
}
.badge.remote {
  color: #f0a878;
  border: 1px solid #f0a87855;
}
.badge.local {
  color: #42d392;
  border: 1px solid #42d39255;
}
.chevron {
  display: inline-block;
  transition: transform 120ms;
  color: var(--ev-c-text-3);
}
.chevron.open {
  transform: rotate(90deg);
}
.spinner {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border: 2px solid var(--ev-c-gray-2);
  border-top-color: var(--ev-c-text-2);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.muted {
  color: var(--ev-c-text-3);
  cursor: default;
}
.error {
  color: #f08a8a;
  cursor: default;
  white-space: normal;
  font-size: 12px;
  line-height: 1.4;
}
</style>
