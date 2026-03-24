# Stack: React + CSS Modules

React component with co-located CSS Module file.

## Conventions
- Functional components with TypeScript
- CSS Modules (`.module.css`) for scoped styles
- Use exact Figma values in CSS (no utility classes)
- CSS variables for design tokens

## Output filenames
- `Component.tsx`
- `Component.module.css`

## Template
```tsx
import styles from './Component.module.css';

export default function ComponentName() {
  return (
    <div className={styles.container}>
      {/* design tree → JSX elements */}
    </div>
  );
}
```

```css
/* Component.module.css */
.container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}
```
