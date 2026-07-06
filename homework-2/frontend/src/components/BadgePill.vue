<script setup>
import { computed } from 'vue';
import {
  PRIORITY_STYLES,
  STATUS_STYLES,
  CATEGORY_STYLES,
  humanize,
} from '../constants.js';

const props = defineProps({
  value: { type: String, default: '' },
  kind: { type: String, default: 'category' }, // category | priority | status
});

const styleMap = {
  category: CATEGORY_STYLES,
  priority: PRIORITY_STYLES,
  status: STATUS_STYLES,
};

const classes = computed(
  () => styleMap[props.kind]?.[props.value] || 'bg-slate-100 text-slate-600 ring-slate-200'
);
const label = computed(() => humanize(props.value));
</script>

<template>
  <span
    v-if="value"
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset"
    :class="classes"
  >
    {{ label }}
  </span>
</template>
