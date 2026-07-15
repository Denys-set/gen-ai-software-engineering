<script setup>
import { ref } from 'vue';
import { useTickets } from '../composables/useTickets.js';

const emit = defineEmits(['imported', 'close']);
const { importFile, toMessage } = useTickets();

const file = ref(null);
const busy = ref(false);
const summary = ref(null);
const errorMsg = ref(null);

function onFile(e) {
  file.value = e.target.files[0] || null;
  summary.value = null;
  errorMsg.value = null;
}

async function upload() {
  if (!file.value) return;
  busy.value = true;
  errorMsg.value = null;
  try {
    summary.value = await importFile(file.value);
    emit('imported', summary.value);
  } catch (err) {
    errorMsg.value = toMessage(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-slate-700">Bulk import</h2>
      <button class="text-slate-400 hover:text-slate-600" @click="emit('close')">✕</button>
    </div>

    <p class="mb-3 text-xs text-slate-500">
      Upload a <code>.csv</code>, <code>.json</code>, or <code>.xml</code> file (max 5 MB).
    </p>

    <input
      type="file"
      accept=".csv,.json,.xml"
      class="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
      @change="onFile"
    />

    <div class="mt-3 flex justify-end">
      <button class="btn-primary" :disabled="!file || busy" @click="upload">
        {{ busy ? 'Importing…' : 'Import' }}
      </button>
    </div>

    <p v-if="errorMsg" class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ errorMsg }}
    </p>

    <!-- Import summary -->
    <div v-if="summary" class="mt-4 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
      <div class="grid grid-cols-3 gap-3 text-center">
        <div>
          <p class="text-2xl font-semibold text-slate-800">{{ summary.total }}</p>
          <p class="text-xs uppercase tracking-wide text-slate-500">Total</p>
        </div>
        <div>
          <p class="text-2xl font-semibold text-emerald-600">{{ summary.successful }}</p>
          <p class="text-xs uppercase tracking-wide text-slate-500">Imported</p>
        </div>
        <div>
          <p class="text-2xl font-semibold text-red-600">{{ summary.failed }}</p>
          <p class="text-xs uppercase tracking-wide text-slate-500">Failed</p>
        </div>
      </div>
      <p class="mt-2 text-center text-xs text-slate-400">Format: {{ summary.format }}</p>

      <div v-if="summary.errors && summary.errors.length" class="mt-3">
        <p class="mb-1 text-xs font-semibold text-slate-600">Errors</p>
        <ul class="max-h-40 space-y-1 overflow-auto text-xs text-red-700">
          <li v-for="(e, i) in summary.errors" :key="i" class="rounded bg-red-50 px-2 py-1">
            <span v-if="e.row != null">Row {{ e.row }} · </span>{{ e.field }}: {{ e.message }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
