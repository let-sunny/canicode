# Stack: Vue 3 + Scoped CSS

Vue 3 Single File Component with scoped styles.

## Conventions
- Composition API with `<script setup lang="ts">`
- Scoped `<style>` with exact Figma values
- CSS variables for design tokens

## Output filename
`Component.vue`

## Template
```vue
<script setup lang="ts">
// props/state if needed
</script>

<template>
  <div class="container">
    <!-- design tree → template elements -->
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}
</style>
```
