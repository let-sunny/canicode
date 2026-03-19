import { z } from "zod";

export const CategorySchema = z.enum([
  "layout",
  "token",
  "component",
  "naming",
  "ai-readability",
  "handoff-risk",
]);

export type Category = z.infer<typeof CategorySchema>;

export const CATEGORIES = CategorySchema.options;

export const CATEGORY_LABELS: Record<Category, string> = {
  layout: "레이아웃",
  token: "디자인 토큰",
  component: "컴포넌트",
  naming: "네이밍",
  "ai-readability": "AI 가독성",
  "handoff-risk": "핸드오프 리스크",
};
