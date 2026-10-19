import { Value } from '@sinclair/typebox/value';
import { ReadinessSchema, SystemInfoSchema, type SystemInfo } from '@samokettik/contracts';

export async function checkSystem(signal: AbortSignal): Promise<SystemInfo> {
  const readiness = await fetch('/health/ready', { signal, cache: 'no-store' });
  const status: unknown = await readiness.json();
  if (!readiness.ok || !Value.Check(ReadinessSchema, status)) throw new Error('API или база данных недоступны. Проверьте запуск сервисов и миграции.');
  const response = await fetch('/api/v1/system', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось получить данные из PostgreSQL. Повторите проверку.');
  const data: unknown = await response.json();
  if (!Value.Check(SystemInfoSchema, data)) throw new Error('Ответ API не соответствует контракту.');
  return data;
}
