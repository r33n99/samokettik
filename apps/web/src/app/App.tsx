import { useCallback, useEffect, useRef, useState } from 'react';
import type { SystemInfo } from '@samokettik/contracts';
import { checkSystem } from '../api/system';
import styles from './App.module.scss';

type Connection = { state: 'checking' } | { state: 'ready'; system: SystemInfo } | { state: 'error'; message: string };

export function App() {
  const [connection, setConnection] = useState<Connection>({ state: 'checking' });
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setConnection({ state: 'checking' });
    void checkSystem(AbortSignal.any([request.signal, AbortSignal.timeout(10000)]))
      .then(system => { if (!request.signal.aborted) setConnection({ state: 'ready', system }); })
      .catch((error: unknown) => {
        if (!request.signal.aborted) setConnection({ state: 'error', message: error instanceof Error && error.name !== 'TypeError' ? error.message : 'Нет соединения с API. Проверьте запуск backend.' });
      });
  }, []);
  useEffect(() => { refresh(); return () => controller.current?.abort(); }, [refresh]);
  return (
    <main className={styles.page}>
      <header className={styles.header}><a className={styles.wordmark} href="/">СамоКеттик</a><span>Бишкек</span></header>
      <section className={styles.status} aria-labelledby="title">
        <p className={styles.caption}>Локальное окружение</p>
        <h1 id="title">Подключение к системе</h1>
        <div role="status" aria-live="polite" aria-atomic="true" className={styles.result}>
          <span className={`${styles.dot} ${connection.state === 'ready' ? styles.online : ''}`} aria-hidden="true" />
          <p>{connection.state === 'checking' ? 'Проверяем API и PostgreSQL…' : connection.state === 'ready' ? 'API и PostgreSQL доступны' : connection.message}</p>
        </div>
        {connection.state === 'ready' ? <dl className={styles.details}>
          <div><dt>Транспорт в базе</dt><dd>{connection.system.vehicleCount} самокатов</dd></div>
          <div><dt>Часовой пояс</dt><dd>{connection.system.timezone}</dd></div>
          <div><dt>Валюта</dt><dd>{connection.system.currency}</dd></div>
        </dl> : null}
        <button className={styles.button} type="button" onClick={refresh} disabled={connection.state === 'checking'}>Проверить снова</button>
      </section>
      <footer className={styles.footer}>Технический стенд. Аренда пока не реализована.</footer>
    </main>
  );
}
