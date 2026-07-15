<script setup>
import BadgePill from './BadgePill.vue';

defineProps({
  tickets: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  count: { type: Number, default: 0 },
});

const emit = defineEmits(['select']);

function confidencePct(t) {
  return t.classification_confidence == null
    ? null
    : Math.round(t.classification_confidence * 100);
}
</script>

<template>
  <div class="card">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-slate-700">
        Tickets <span class="text-slate-400">({{ count }})</span>
      </h2>
    </div>

    <div v-if="loading" class="py-10 text-center text-sm text-slate-400">
      Loading tickets…
    </div>

    <div v-else-if="tickets.length === 0" class="py-10 text-center text-sm text-slate-400">
      No tickets match the current filters.
    </div>

    <ul v-else class="divide-y divide-slate-100">
      <li
        v-for="t in tickets"
        :key="t.id"
        class="cursor-pointer py-3 transition hover:bg-slate-50"
        @click="emit('select', t.id)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-medium text-slate-800">{{ t.subject }}</p>
            <p class="truncate text-xs text-slate-500">
              {{ t.customer_name }} · {{ t.customer_email }}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <BadgePill :value="t.category" kind="category" />
            <BadgePill :value="t.priority" kind="priority" />
            <BadgePill :value="t.status" kind="status" />
          </div>
        </div>
        <div
          v-if="confidencePct(t) !== null"
          class="mt-1 text-xs text-slate-400"
        >
          Auto-classified · confidence {{ confidencePct(t) }}%
          <span v-if="t.manually_overridden" class="ml-1 text-amber-600">(overridden)</span>
        </div>
      </li>
    </ul>
  </div>
</template>
