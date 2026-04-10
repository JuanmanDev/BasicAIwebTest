<template>
  <div class="mcp-ui-table overflow-x-auto">
    <UTable
      :columns="columns"
      :rows="data"
      :loading="isLoading"
      :empty-state="emptyState"
      v-bind="$attrs"
    >
      <template v-for="(_, name) in $slots" #[name]="slotData">
        <slot :name="name" v-bind="slotData" />
      </template>
      
      <template #actions-column="{ row }">
        <div v-if="rowActions" class="flex gap-2">
          <UButton
            v-for="(action, index) in rowActions"
            :key="index"
            :color="action.color || 'gray'"
            :variant="action.variant || 'ghost'"
            size="xs"
            @click="handleRowAction(action, row)"
          >
            {{ action.label }}
          </UButton>
        </div>
      </template>
    </UTable>
  </div>
</template>

<script setup lang="ts">
interface TableAction {
  label: string;
  action: string;
  color?: string;
  variant?: 'solid' | 'outline' | 'soft' | 'ghost';
  icon?: string;
}

interface Props {
  columns?: Array<{ key: string; label: string; sortable?: boolean }>;
  data?: Record<string, unknown>[];
  isLoading?: boolean;
  emptyState?: {
    icon?: string;
    title?: string;
    description?: string;
  };
  rowActions?: TableAction[];
}

interface Emits {
  (e: 'action', action: string, row?: Record<string, unknown>): void;
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
});

const emit = defineEmits<Emits>();

const defaultEmptyState = {
  icon: 'i-heroicons-circle-stack',
  title: 'No data',
  description: 'No results found for the current filters.',
};

const emptyState = computed(() => props.emptyState || defaultEmptyState);

function handleRowAction(action: TableAction, row: Record<string, unknown>) {
  emit('action', action.action, row);
}
</script>
