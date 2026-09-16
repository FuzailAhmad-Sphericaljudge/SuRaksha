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
  DATABASE_PATH: z.string().trim().min(1).optional(),
});

export function readConfig(environment: NodeJS.ProcessEnv) {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    // Report keys, never raw values (future config may contain secrets).
    throw new Error(
      `Invalid server configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }
  if (result.data.APP_MODE === 'production' && !result.data.DATABASE_PATH)
    throw new Error('Invalid server configuration: DATABASE_PATH');
  return {
    ...result.data,
    DATABASE_PATH: result.data.DATABASE_PATH ?? 'data/suraksha-demo.sqlite',
  };
}
