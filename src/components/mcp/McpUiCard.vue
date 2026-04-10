<template>
  <UCard :class="['mcp-ui-card', $props.class]">
    <template v-if="title" #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">{{ title }}</h3>
        <UBadge v-if="badge" :color="badgeColor">{{ badge }}</UBadge>
      </div>
    </template>

    <div class="space-y-4">
      <slot>
        <p v-if="description" class="text-gray-600 dark:text-gray-400">
          {{ description }}
        </p>
        
        <div v-if="content" class="prose dark:prose-invert">
          <component :is="content" />
        </div>
      </slot>
    </div>

    <template v-if="actions && actions.length > 0" #footer>
      <div class="flex gap-2">
        <UButton
          v-for="(action, index) in actions"
          :key="index"
          :color="actionColor(action)"
          :variant="actionVariant(action)"
          @click="handleAction(action)"
        >
          {{ action.label }}
        </UButton>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
interface McpCardAction {
  label: string;
  action: string;
  variant?: 'primary' | 'secondary' | 'outline';
  color?: string;
  params?: Record<string, unknown>;
}

interface Props {
  title?: string;
  description?: string;
  content?: any;
  badge?: string;
  badgeColor?: string;
  actions?: McpCardAction[];
  class?: string;
}

interface Emits {
  (e: 'action', action: string, params?: Record<string, unknown>): void;
}

const props = withDefaults(defineProps<Props>(), {
  badgeColor: 'blue',
  class: '',
});

const emit = defineEmits<Emits>();

function actionColor(action: McpCardAction): string {
  return action.color || 'gray';
}

function actionVariant(action: McpCardAction): 'solid' | 'outline' | 'soft' {
  switch (action.variant) {
    case 'primary':
      return 'solid';
    case 'secondary':
      return 'soft';
    case 'outline':
      return 'outline';
    default:
      return 'solid';
  }
}

function handleAction(action: McpCardAction) {
  emit('action', action.action, action.params);
}
</script>
