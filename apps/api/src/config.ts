import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  APP_MODE: z.enum(['demo', 'production']).default('demo'),
});

export function readConfig(environment: NodeJS.ProcessEnv) {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    // Report keys, never raw values (future config may contain secrets).
    throw new Error(
      `Invalid server configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }
  return result.data;
}
