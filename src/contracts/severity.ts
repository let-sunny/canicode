import { z } from "zod";

export const SeveritySchema = z.enum(["error", "warning", "info"]);

export type Severity = z.infer<typeof SeveritySchema>;

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  error: 10,
  warning: 5,
  info: 1,
};
