# Stack: React + Tailwind CSS

Single React component file with Tailwind utility classes.

## Conventions
- Functional components with TypeScript
- Tailwind utility classes (no custom CSS unless unavoidable)
- Map Figma values to Tailwind classes: `gap: 16px` → `gap-4`, `padding: 24px` → `p-6`
- Use arbitrary values when no Tailwind class matches: `w-[412px]`, `gap-[13px]`
- CSS variables from design tokens → Tailwind theme or arbitrary values

## Output filename
`Component.tsx`

## Template
```tsx
export default function ComponentName() {
  return (
    <div className="flex flex-col gap-4 p-6">
      {/* design tree → JSX elements */}
    </div>
  );
}
```

## Image handling
```tsx
<img src="images/hero-banner@2x.png" alt="Hero Banner" className="w-full h-auto" />
```
