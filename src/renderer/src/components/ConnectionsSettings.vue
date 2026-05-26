<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useConnections } from '../composables/useConnections'

const emit = defineEmits<{ close: [] }>()

const { connections, remove, rename, addRemote, addLocal, pickFolder } = useConnections()

// Which add form is open (undefined = show the two chooser buttons).
const mode = ref<'remote' | 'local'>()

// Token-help popover shown from the info icon in the remote form head.
const showHelp = ref(false)
const helpWrap = ref<HTMLElement>()

function toggleHelp(): void {
  showHelp.value = !showHelp.value
}

// Close the popover when clicking anywhere outside it.
function onDocPointerDown(event: PointerEvent): void {
  if (helpWrap.value && !helpWrap.value.contains(event.target as Node)) showHelp.value = false
}
window.addEventListener('pointerdown', onDocPointerDown, true)
onBeforeUnmount(() => window.removeEventListener('pointerdown', onDocPointerDown, true))

// Add-remote form
const remoteLabel = ref('')
const remoteToken = ref('')
const remoteError = ref('')
const addingRemote = ref(false)

// Add-local form
const localLabel = ref('')
const localPath = ref('')
const localError = ref('')
const addingLocal = ref(false)

// Required-field validation — highlight missing fields only after a submit attempt.
const remoteAttempted = ref(false)
const localAttempted = ref(false)
const remoteLabelInvalid = computed(() => remoteAttempted.value && !remoteLabel.value.trim())
const remoteTokenInvalid = computed(() => remoteAttempted.value && !remoteToken.value.trim())
const localLabelInvalid = computed(() => localAttempted.value && !localLabel.value.trim())
const localPathInvalid = computed(() => localAttempted.value && !localPath.value.trim())

// Back to the chooser, discarding any in-progress input.
function resetMode(): void {
  mode.value = undefined
  showHelp.value = false
  remoteLabel.value = ''
  remoteToken.value = ''
  remoteError.value = ''
  remoteAttempted.value = false
  localLabel.value = ''
  localPath.value = ''
  localError.value = ''
  localAttempted.value = false
}

async function submitRemote(): Promise<void> {
  remoteAttempted.value = true
  if (!remoteLabel.value.trim() || !remoteToken.value.trim()) return
  remoteError.value = ''
  addingRemote.value = true
  try {
    await addRemote(remoteLabel.value, remoteToken.value)
    resetMode()
    emit('close')
  } catch (error) {
    remoteError.value = error instanceof Error ? error.message : 'Failed to add connection.'
  } finally {
    addingRemote.value = false
  }
}

async function chooseFolder(): Promise<void> {
  const path = await pickFolder()
  if (path) localPath.value = path
}

async function submitLocal(): Promise<void> {
  localAttempted.value = true
  if (!localLabel.value.trim() || !localPath.value.trim()) return
  localError.value = ''
  addingLocal.value = true
  try {
    await addLocal(localLabel.value, localPath.value)
    resetMode()
    emit('close')
  } catch (error) {
    localError.value = error instanceof Error ? error.message : 'Failed to add connection.'
  } finally {
    addingLocal.value = false
  }
}

// Inline rename (window.prompt is unsupported in Electron).
const editingId = ref<string>()
const editLabel = ref('')

function startEdit(id: string, current: string): void {
  editingId.value = id
  editLabel.value = current
}

async function saveEdit(): Promise<void> {
  const label = editLabel.value.trim()
  if (editingId.value && label) await rename(editingId.value, label)
  editingId.value = undefined
}
</script>

<template>
  <div class="connections">
    <div class="conn-list-wrap">
      <ul v-if="connections.length" class="conn-list">
        <li v-for="connection in connections" :key="connection.id" class="conn">
          <span class="badge" :class="connection.type">{{
            connection.type === 'remote' ? 'remote' : 'local'
          }}</span>
          <template v-if="editingId === connection.id">
            <input
              v-model="editLabel"
              class="input edit"
              autofocus
              @keyup.enter="saveEdit"
              @keyup.esc="editingId = undefined"
            />
            <button class="link" @click="saveEdit">Save</button>
            <button class="link" @click="editingId = undefined">Cancel</button>
          </template>
          <template v-else>
            <div class="conn-text">
              <div class="conn-label">{{ connection.label }}</div>
              <div v-if="connection.projectPath" class="conn-sub">{{ connection.projectPath }}</div>
            </div>
            <button class="link" @click="startEdit(connection.id, connection.label)">Rename</button>
            <button class="link danger" @click="remove(connection.id)">Remove</button>
          </template>
        </li>
      </ul>
      <p v-else class="muted empty">No connections yet.</p>
    </div>

    <div class="add-area">
      <!-- Chooser: pick which kind of connection to add. -->
      <div v-if="!mode" class="add-choices">
        <button class="btn" @click="mode = 'remote'">Add Cloudflare token</button>
        <button class="btn" @click="mode = 'local'">Add local project</button>
      </div>

      <!-- Full-width form for the chosen kind. -->
      <form v-else-if="mode === 'remote'" class="add-form" @submit.prevent="submitRemote">
        <div class="add-form-head">
          <div ref="helpWrap" class="head-label">
            <h3>Add Cloudflare token</h3>
            <button
              class="info-btn"
              type="button"
              aria-label="How to create an API token"
              :aria-expanded="showHelp"
              @click="toggleHelp"
            >
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.3" />
                <circle cx="8" cy="4.5" r="0.95" fill="currentColor" />
                <rect x="7.25" y="6.75" width="1.5" height="5" rx="0.6" fill="currentColor" />
              </svg>
            </button>
            <div v-if="showHelp" class="help-pop" role="dialog">
              <a
                class="help-link"
                href="https://developers.cloudflare.com/fundamentals/api/get-started/create-token/"
                target="_blank"
                rel="noreferrer"
              >
                How to create a API token ↗
              </a>
              <p class="help-perms-title">Permissions this app needs:</p>
              <ul class="help-perms">
                <li>Account · Access — <strong>Read</strong></li>
                <li>Account · D1 — <strong>Edit</strong></li>
                <li>Account · Account Settings — <strong>Read</strong></li>
              </ul>
            </div>
          </div>
          <button class="link" type="button" @click="resetMode">Cancel</button>
        </div>
        <input
          v-model="remoteLabel"
          class="input"
          :class="{ invalid: remoteLabelInvalid }"
          placeholder="Label"
        />
        <input
          v-model="remoteToken"
          type="password"
          class="input"
          :class="{ invalid: remoteTokenInvalid }"
          placeholder="API token"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="btn primary" type="submit" :disabled="addingRemote">
          {{ addingRemote ? 'Verifying…' : 'Add token' }}
        </button>
        <p v-if="remoteError" class="error">{{ remoteError }}</p>
      </form>

      <form v-else class="add-form" @submit.prevent="submitLocal">
        <div class="add-form-head">
          <h3>Add local project</h3>
          <button class="link" type="button" @click="resetMode">Cancel</button>
        </div>
        <input
          v-model="localLabel"
          class="input"
          :class="{ invalid: localLabelInvalid }"
          placeholder="Label"
        />
        <div class="folder-row" :class="{ invalid: localPathInvalid }">
          <button class="btn" type="button" @click="chooseFolder">Choose folder…</button>
          <span class="folder-path" :title="localPath">{{ localPath || 'No folder chosen' }}</span>
        </div>
        <button class="btn primary" type="submit" :disabled="addingLocal">
          {{ addingLocal ? 'Checking…' : 'Add project' }}
        </button>
        <p v-if="localError" class="error">{{ localError }}</p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.connections {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.conn-list-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.conn-list {
  margin: 0;
  padding: 0;
}
.conn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--ev-c-gray-3);
}
.conn:last-child {
  border-bottom: none;
}
.conn-text {
  flex: 1;
  min-width: 0;
}
.conn-label {
  font-weight: 600;
}
.conn-sub {
  font-size: 12px;
  color: var(--ev-c-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  border-radius: 8px;
  padding: 2px 7px;
}
.badge.remote {
  color: #f0a878;
  border: 1px solid #f0a87855;
}
.badge.local {
  color: #42d392;
  border: 1px solid #42d39255;
}
.empty {
  padding: 8px 0;
}
.add-area {
  flex-shrink: 0;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--ev-c-gray-3);
}
.add-choices {
  display: flex;
  gap: 10px;
}
.add-choices .btn {
  flex: 1;
}
.add-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.add-form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.add-form-head h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--ev-c-text-2);
}
.head-label {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
}
.info-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  color: var(--ev-c-text-3);
  cursor: pointer;
}
.info-btn:hover,
.info-btn[aria-expanded='true'] {
  color: #3178c6;
}
.help-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 1000;
  width: 260px;
  padding: 12px;
  background: var(--color-background-soft);
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
}
.help-link {
  color: #3178c6;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}
.help-link:hover {
  text-decoration: underline;
}
.help-perms-title {
  margin: 10px 0 4px;
  font-size: 12px;
  color: var(--ev-c-text-2);
}
.help-perms {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ev-c-text-3);
}
.help-perms strong {
  color: var(--color-text);
  font-weight: 600;
}
.input {
  background: var(--color-background-mute);
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 6px;
  color: var(--color-text);
  padding: 6px 10px;
  font-size: 13px;
}
.input:focus {
  outline: none;
  border-color: #3178c6;
}
.input.invalid {
  border-color: #f08a8a;
}
.input.invalid:focus {
  border-color: #f08a8a;
}
.input.edit {
  flex: 1;
}
.folder-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.folder-row .btn {
  flex-shrink: 0;
}
.folder-row.invalid .btn {
  border-color: #f08a8a;
  color: #f08a8a;
}
.folder-row.invalid .folder-path {
  color: #f08a8a;
}
.folder-path {
  flex: 1;
  min-width: 0;
  padding-top: 7px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ev-c-text-3);
  overflow-wrap: anywhere;
}
.btn {
  cursor: pointer;
  border: 1px solid var(--ev-c-gray-3);
  color: var(--ev-button-alt-text);
  background: var(--ev-button-alt-bg);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn.primary {
  background: #3178c6;
  color: #fff;
  border-color: #3178c6;
}
.link {
  background: none;
  border: none;
  color: var(--ev-c-text-2);
  cursor: pointer;
  font-size: 13px;
}
.link.danger {
  color: #f08a8a;
}
.muted {
  color: var(--ev-c-text-2);
}
.error {
  color: #f08a8a;
  font-size: 12px;
}
</style>
