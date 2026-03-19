import { z } from "zod";

/**
 * 분석에 필요한 Figma 노드 타입만 정의
 * 실제 Figma API 타입은 @figma/rest-api-spec 참조
 */

export const AnalysisNodeTypeSchema = z.enum([
  "DOCUMENT",
  "CANVAS",
  "FRAME",
  "GROUP",
  "SECTION",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "RECTANGLE",
  "ELLIPSE",
  "VECTOR",
  "TEXT",
  "LINE",
  "BOOLEAN_OPERATION",
  "STAR",
  "REGULAR_POLYGON",
  "SLICE",
  "STICKY",
  "SHAPE_WITH_TEXT",
  "CONNECTOR",
  "WIDGET",
  "EMBED",
  "LINK_UNFURL",
  "TABLE",
  "TABLE_CELL",
]);

export type AnalysisNodeType = z.infer<typeof AnalysisNodeTypeSchema>;

export const LayoutModeSchema = z.enum(["NONE", "HORIZONTAL", "VERTICAL"]);
export type LayoutMode = z.infer<typeof LayoutModeSchema>;

export const LayoutAlignSchema = z.enum(["MIN", "CENTER", "MAX", "STRETCH", "INHERIT"]);
export type LayoutAlign = z.infer<typeof LayoutAlignSchema>;

export const LayoutPositioningSchema = z.enum(["AUTO", "ABSOLUTE"]);
export type LayoutPositioning = z.infer<typeof LayoutPositioningSchema>;

/**
 * 분석용 경량 FigmaNode 타입
 * rules에서 실제로 필요한 속성만 포함
 */
const BaseAnalysisNodeSchema = z.object({
  // 기본 식별
  id: z.string(),
  name: z.string(),
  type: AnalysisNodeTypeSchema,
  visible: z.boolean().default(true),

  // 레이아웃 분석용
  layoutMode: LayoutModeSchema.optional(),
  layoutAlign: LayoutAlignSchema.optional(),
  layoutPositioning: LayoutPositioningSchema.optional(),
  primaryAxisAlignItems: z.string().optional(),
  counterAxisAlignItems: z.string().optional(),
  itemSpacing: z.number().optional(),
  paddingLeft: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingTop: z.number().optional(),
  paddingBottom: z.number().optional(),

  // 크기/위치 분석용
  absoluteBoundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable()
    .optional(),

  // 컴포넌트 분석용
  componentId: z.string().optional(),
  componentPropertyDefinitions: z.record(z.string(), z.unknown()).optional(),
  componentProperties: z.record(z.string(), z.unknown()).optional(),

  // 스타일/토큰 분석용
  styles: z.record(z.string(), z.string()).optional(),
  fills: z.array(z.unknown()).optional(),
  strokes: z.array(z.unknown()).optional(),
  effects: z.array(z.unknown()).optional(),

  // 변수 바인딩 분석용 (디자인 토큰)
  boundVariables: z.record(z.string(), z.unknown()).optional(),

  // 텍스트 분석용
  characters: z.string().optional(),
  style: z.record(z.string(), z.unknown()).optional(),

  // 핸드오프 분석용
  devStatus: z
    .object({
      type: z.enum(["NONE", "READY_FOR_DEV", "COMPLETED"]),
      description: z.string().optional(),
    })
    .optional(),

  // 네이밍 분석에 활용할 메타 정보
  isAsset: z.boolean().optional(),
});

export type AnalysisNode = z.infer<typeof BaseAnalysisNodeSchema> & {
  children?: AnalysisNode[] | undefined;
};

export const AnalysisNodeSchema: z.ZodType<AnalysisNode> =
  BaseAnalysisNodeSchema.extend({
    children: z.lazy(() => AnalysisNodeSchema.array().optional()),
  }) as z.ZodType<AnalysisNode>;

/**
 * 분석용 Figma 파일 메타데이터
 */
export const AnalysisFileSchema = z.object({
  fileKey: z.string(),
  name: z.string(),
  lastModified: z.string(),
  version: z.string(),
  document: AnalysisNodeSchema,
  components: z.record(
    z.string(),
    z.object({
      key: z.string(),
      name: z.string(),
      description: z.string(),
    })
  ),
  styles: z.record(
    z.string(),
    z.object({
      key: z.string(),
      name: z.string(),
      styleType: z.string(),
    })
  ),
});

export type AnalysisFile = z.infer<typeof AnalysisFileSchema>;
