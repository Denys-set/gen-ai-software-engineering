<script setup>
import { reactive, ref } from 'vue';
import { useTickets } from '../composables/useTickets.js';

const emit = defineEmits(['created', 'close']);
const { createTicket, toMessage } = useTickets();

const form = reactive({
  customer_id: '',
  customer_email: '',
  customer_name: '',
  subject: '',
  description: '',
});
const autoClassify = ref(true);
const submitting = ref(false);
const errorMsg = ref(null);

async function submit() {
  submitting.value = true;
  errorMsg.value = null;
  try {
    const ticket = await createTicket({ ...form }, autoClassify.value);
    emit('created', ticket);
  } catch (err) {
    errorMsg.value = toMessage(err);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-slate-700">Create ticket</h2>
      <button class="text-slate-400 hover:text-slate-600" @click="emit('close')">✕</button>
    </div>

    <form class="space-y-3" @submit.prevent="submit">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="label">Customer ID</label>
          <input v-model="form.customer_id" class="input" required />
        </div>
        <div>
          <label class="label">Customer email</label>
          <input v-model="form.customer_email" type="email" class="input" required />
        </div>
      </div>

      <div>
        <label class="label">Customer name</label>
        <input v-model="form.customer_name" class="input" required />
      </div>

      <div>
        <label class="label">Subject</label>
        <input v-model="form.subject" class="input" maxlength="200" required />
      </div>

      <div>
        <label class="label">Description</label>
        <textarea
          v-model="form.description"
          class="input min-h-[90px]"
          minlength="10"
          maxlength="2000"
          required
        ></textarea>
        <p class="mt-1 text-xs text-slate-400">{{ form.description.length }}/2000 · min 10</p>
      </div>

      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="autoClassify" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
        Auto-classify on creation
      </label>

      <p v-if="errorMsg" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {{ errorMsg }}
      </p>

      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn-primary" :disabled="submitting">
          {{ submitting ? 'Creating…' : 'Create ticket' }}
        </button>
      </div>
    </form>
  </div>
</template>
