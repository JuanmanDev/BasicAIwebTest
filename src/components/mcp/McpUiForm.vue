<template>
  <div class="mcp-ui-form space-y-4">
    <form @submit.prevent="handleSubmit">
      <div v-if="fields" class="grid gap-4" :class="gridClass">
        <UFormField
          v-for="(field, index) in fields"
          :key="index"
          :label="field.label"
          :name="field.name"
          :error="errors[field.name]"
        >
          <component
            :is="getFieldComponent(field.type)"
            v-model="formData[field.name]"
            v-bind="getFieldProps(field)"
            :placeholder="field.placeholder"
            :required="field.required"
          />
        </UFormField>
      </div>

      <div class="flex justify-end gap-2 mt-6">
        <UButton
          type="button"
          color="gray"
          variant="outline"
          @click="handleReset"
        >
          Reset
        </UButton>
        <UButton
          type="submit"
          color="primary"
          :loading="isLoading"
        >
          {{ submitLabel || 'Submit' }}
        </UButton>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'number' | 'select' | 'textarea' | 'checkbox' | 'file';
  placeholder?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string | number }>;
  defaultValue?: any;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
}

interface Props {
  fields?: FormField[];
  submitLabel?: string;
  columns?: number;
  action?: string;
  params?: Record<string, unknown>;
}

interface Emits {
  (e: 'action', action: string, data?: Record<string, unknown>): void;
  (e: 'submit', data: Record<string, unknown>): void;
}

const props = withDefaults(defineProps<Props>(), {
  columns: 1,
  submitLabel: 'Submit',
});

const emit = defineEmits<Emits>();

const formData = ref<Record<string, any>>({});
const errors = ref<Record<string, string>>({});
const isLoading = ref(false);

const gridClass = computed(() => {
  if (props.columns === 2) return 'grid-cols-1 md:grid-cols-2';
  if (props.columns === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-1';
});

// Initialize form data with default values
onMounted(() => {
  if (props.fields) {
    for (const field of props.fields) {
      formData.value[field.name] = field.defaultValue ?? '';
    }
  }
});

function getFieldComponent(type: string): string {
  const componentMap: Record<string, string> = {
    text: 'UInput',
    email: 'UInput',
    password: 'UInput',
    number: 'UInput',
    textarea: 'UTextarea',
    select: 'USelect',
    checkbox: 'UCheckbox',
    file: 'UInput',
  };
  return componentMap[type] || 'UInput';
}

function getFieldProps(field: FormField): Record<string, any> {
  const props: Record<string, any> = {};
  
  if (field.type === 'select' && field.options) {
    props.options = field.options;
  }
  
  if (field.type === 'email') {
    props.type = 'email';
  } else if (field.type === 'password') {
    props.type = 'password';
  } else if (field.type === 'number') {
    props.type = 'number';
  } else if (field.type === 'file') {
    props.type = 'file';
  }
  
  if (field.validation) {
    if (field.validation.pattern) {
      props.pattern = field.validation.pattern;
    }
    if (field.validation.minLength) {
      props.minlength = field.validation.minLength;
    }
    if (field.validation.maxLength) {
      props.maxlength = field.validation.maxLength;
    }
  }
  
  return props;
}

function validate(): boolean {
  errors.value = {};
  
  if (!props.fields) return true;
  
  for (const field of props.fields) {
    const value = formData.value[field.name];
    
    if (field.required && !value) {
      errors.value[field.name] = `${field.label} is required`;
      continue;
    }
    
    if (field.validation) {
      if (field.validation.minLength && value.length < field.validation.minLength) {
        errors.value[field.name] = `${field.label} must be at least ${field.validation.minLength} characters`;
      }
      
      if (field.validation.maxLength && value.length > field.validation.maxLength) {
        errors.value[field.name] = `${field.label} must be at most ${field.validation.maxLength} characters`;
      }
      
      if (field.validation.pattern) {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(value)) {
          errors.value[field.name] = `${field.label} format is invalid`;
        }
      }
    }
  }
  
  return Object.keys(errors.value).length === 0;
}

async function handleSubmit() {
  if (!validate()) return;
  
  isLoading.value = true;
  
  try {
    if (props.action) {
      emit('action', props.action, { ...formData.value, ...props.params });
    } else {
      emit('submit', formData.value);
    }
  } catch (error) {
    console.error('Form submission error:', error);
  } finally {
    isLoading.value = false;
  }
}

function handleReset() {
  if (props.fields) {
    for (const field of props.fields) {
      formData.value[field.name] = field.defaultValue ?? '';
    }
  }
  errors.value = {};
}

defineExpose({
  formData,
  reset: handleReset,
  validate,
});
</script>
