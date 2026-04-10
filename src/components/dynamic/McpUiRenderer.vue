<template>
  <component
    :is="renderedComponent"
    v-bind="componentProps"
    @action="handleAction"
    class="mcp-ui-component"
  >
    <template v-if="component.children">
      <McpUiRenderer
        v-for="(child, index) in component.children"
        :key="index"
        :component="child"
        @action="handleChildAction"
      />
    </template>
  </component>
</template>

<script setup lang="ts">
import type { McpUIComponent } from '~/lib/mcp/client';

interface Props {
  component: McpUIComponent;
}

interface Emits {
  (e: 'action', action: string, params?: Record<string, unknown>): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Map MCP UI component types to Vue components
const componentMap: Record<string, any> = {
  card: 'McpUiCard',
  form: 'McpUiForm',
  table: 'McpUiTable',
  chart: 'McpUiChart',
  button: 'UButton',
  input: 'UInput',
  select: 'USelect',
  modal: 'UModal',
  div: 'div',
  span: 'span',
};

const renderedComponent = computed(() => {
  const componentName = componentMap[props.component.type] || 'div';
  
  // Try to resolve component dynamically
  if (typeof window !== 'undefined') {
    return resolveComponent(componentName) || 'div';
  }
  
  return componentName;
});

const componentProps = computed(() => {
  const { type, children, actions, ...rest } = props.component;
  return {
    ...rest.props,
    'data-mcp-type': type,
    'data-mcp-actions': actions ? JSON.stringify(actions) : undefined,
  };
});

function handleAction(action: string, params?: Record<string, unknown>) {
  emit('action', action, params);
}

function handleChildAction(action: string, params?: Record<string, unknown>) {
  // Bubble up child actions
  emit('action', action, params);
}
</script>

<style scoped>
.mcp-ui-component {
  transition: all 0.2s ease;
}

.mcp-ui-component:hover {
  transform: translateY(-1px);
}
</style>
