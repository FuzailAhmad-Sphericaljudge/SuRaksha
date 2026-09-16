import { z } from 'zod';

export const appModeSchema = z.enum(['demo', 'production']);
export const bootstrapResponseSchema = z.strictObject({
  mode: appModeSchema,
  demoData: z.boolean(),
});

export type AppMode = z.infer<typeof appModeSchema>;
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
