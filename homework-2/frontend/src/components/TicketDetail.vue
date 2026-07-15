<script setup>
import { ref, reactive, watch, onMounted } from 'vue';
import { useTickets } from '../composables/useTickets.js';
import { CATEGORIES, PRIORITIES, STATUSES, humanize } from '../constants.js';
import BadgePill from './BadgePill.vue';

const props = defineProps({
  ticketId: { type: String, required: true },
});
const emit = defineEmits(['close', 'changed']);

const {
  getTicket,
  updateTicket,
  autoClassify,
  getClassificationLog,
  deleteTicket,
  toMessage,
} = useTickets();

const ticket = ref(null);
const log = ref([]);
const loading = ref(true);
const busy = ref(false);
const errorMsg = ref(null);
const lastClassification = ref(null);

// Editable override fields.
const override = reactive({ category: '', priority: '', status: '' });

async function load() {
  loading.value = true;
  errorMsg.value = null;
  try {
    ticket.value = await getTicket(props.ticketId);
    override.category = ticket.value.category;
    override.priority = ticket.value.priority;
    override.status = ticket.value.status;
    const logRes = await getClassificationLog(props.ticketId);
    log.value = logRes.log;
  } catch (err) {
    errorMsg.value = toMessage(err);
  } finally {
    loading.value = false;
  }
}

watch(() => props.ticketId, load);
onMounted(load);

async function runAutoClassify() {
  busy.value = true;
  errorMsg.value = null;
  try {
    lastClassification.value = await autoClassify(props.ticketId);
    await load();
    emit('changed');
  } catch (err) {
    errorMsg.value = toMessage(err);
  } finally {
    busy.value = false;
  }
}

async function saveOverride() {
  busy.value = true;
  errorMsg.value = null;
  try {
    await updateTicket(props.ticketId, {
      category: override.category,
      priority: override.priority,
      status: override.status,
    });
    await load();
    emit('changed');
  } catch (err) {
    errorMsg.value = toMessage(err);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!confirm('Delete this ticket?')) return;
  busy.value = true;
  try {
    await deleteTicket(props.ticketId);
    emit('changed');
    emit('close');
  } catch (err) {
    errorMsg.value = toMessage(err);
  } finally {
    busy.value = false;
  }
}

function pct(v) {
  return v == null ? null : Math.round(v * 100);
}
</script>

<template>
  <div class="card">
    <div class="mb-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="truncate text-base font-semibold text-slate-800">
          {{ ticket?.subject || 'Ticket' }}
        </h2>
        <p class="truncate text-xs text-slate-500">{{ ticketId }}</p>
      </div>
      <button class="text-slate-400 hover:text-slate-600" @click="emit('close')">✕</button>
    </div>

    <div v-if="loading" class="py-10 text-center text-sm text-slate-400">Loading…</div>

    <template v-else-if="ticket">
      <!-- Customer + body -->
      <div class="mb-4 space-y-2 text-sm">
        <p><span class="text-slate-400">Customer:</span> {{ ticket.customer_name }} · {{ ticket.customer_email }}</p>
        <p class="whitespace-pre-wrap text-slate-700">{{ ticket.description }}</p>
      </div>

      <div class="mb-4 flex flex-wrap gap-1.5">
        <BadgePill :value="ticket.category" kind="category" />
        <BadgePill :value="ticket.priority" kind="priority" />
        <BadgePill :value="ticket.status" kind="status" />
      </div>

      <!-- Classification result -->
      <div class="mb-4 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Classification
          </p>
          <button class="btn-ghost !py-1 !text-xs" :disabled="busy" @click="runAutoClassify">
            {{ busy ? '…' : 'Run auto-classify' }}
          </button>
        </div>

        <div v-if="ticket.classification_confidence != null" class="space-y-2">
          <div>
            <div class="mb-1 flex justify-between text-xs text-slate-500">
              <span>Confidence</span>
              <span class="font-medium text-slate-700">{{ pct(ticket.classification_confidence) }}%</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                class="h-full bg-brand-500 transition-all"
                :style="{ width: pct(ticket.classification_confidence) + '%' }"
              ></div>
            </div>
          </div>
          <p v-if="ticket.manually_overridden" class="text-xs font-medium text-amber-600">
            ⚠ Manually overridden
          </p>
          <p
            v-if="lastClassification?.reasoning"
            class="rounded bg-white p-2 text-xs text-slate-600 ring-1 ring-slate-200"
          >
            {{ lastClassification.reasoning }}
          </p>
          <div v-if="lastClassification?.keywords_found?.length" class="flex flex-wrap gap-1">
            <span
              v-for="kw in lastClassification.keywords_found"
              :key="kw"
              class="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700"
            >{{ kw }}</span>
          </div>
        </div>
        <p v-else class="text-xs text-slate-400">
          Not yet classified. Run auto-classify to generate a category, priority, and confidence.
        </p>
      </div>

      <!-- Manual override -->
      <div class="mb-4 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
        <p class="label mb-3">Manual override</p>
        <div class="space-y-3">
          <div class="space-y-1">
            <label class="block text-xs font-medium text-slate-500">Category</label>
            <select v-model="override.category" class="select">
              <option v-for="c in CATEGORIES" :key="c" :value="c">{{ humanize(c) }}</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-slate-500">Priority</label>
            <select v-model="override.priority" class="select">
              <option v-for="p in PRIORITIES" :key="p" :value="p">{{ humanize(p) }}</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-slate-500">Status</label>
            <select v-model="override.status" class="select">
              <option v-for="s in STATUSES" :key="s" :value="s">{{ humanize(s) }}</option>
            </select>
          </div>
        </div>
        <div class="mt-4 flex justify-end">
          <button class="btn-primary !py-1.5 !text-xs" :disabled="busy" @click="saveOverride">
            Save changes
          </button>
        </div>
      </div>

      <!-- Classification log -->
      <div v-if="log.length" class="mb-4">
        <p class="label">Decision log ({{ log.length }})</p>
        <ul class="max-h-52 space-y-2 overflow-auto">
          <li
            v-for="(e, i) in log"
            :key="i"
            class="rounded-lg bg-slate-50 p-2 text-xs ring-1 ring-slate-200"
          >
            <div class="flex items-center justify-between">
              <span
                class="font-medium"
                :class="e.source === 'manual_override' ? 'text-amber-600' : 'text-brand-600'"
              >{{ humanize(e.source) }}</span>
              <span class="text-slate-400">{{ new Date(e.timestamp).toLocaleString() }}</span>
            </div>
            <p class="mt-1 text-slate-600">
              → {{ humanize(e.result.category) }} · {{ humanize(e.result.priority) }}
              <span v-if="e.result.confidence != null">· {{ pct(e.result.confidence) }}%</span>
            </p>
          </li>
        </ul>
      </div>

      <p v-if="errorMsg" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {{ errorMsg }}
      </p>

      <div class="flex justify-between border-t border-slate-100 pt-3">
        <button class="btn-ghost !text-red-600 !ring-red-200 hover:!bg-red-50" :disabled="busy" @click="remove">
          Delete
        </button>
        <button class="btn-ghost" @click="emit('close')">Close</button>
      </div>
    </template>
  </div>
</template>
