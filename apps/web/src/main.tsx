import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchHealth } from './api';
import './styles.css';

function App() {
  const [status, setStatus] = useState('Connecting…');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('Connecting…');
    void fetchHealth(controller.signal)
      .then(() => {
        if (!controller.signal.aborted) setStatus('Connected');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('Unavailable');
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <main>
      <header>
        <a href="/" aria-label="SafePG India home">
          SafePG<span> India</span>
        </a>
        <span>SuRaksha</span>
      </header>
      <section aria-labelledby="title">
        <p className="eyebrow">PGs · Hostels · Coaching spaces</p>
        <h1 id="title">
          A clearer picture.
          <br />A safer place to learn.
        </h1>
        <p className="intro">
          Understand reported concerns, see the evidence and follow what happens
          next.
        </p>
        <aside>
          <strong>We’re building SafePG.</strong>
          <p>
            Property search, reports and inspections are not available yet. No
            buildings have been verified on this platform.
          </p>
        </aside>
      </section>
      <footer>
        <p role="status">Service connection: {status}</p>
        {status === 'Unavailable' && (
          <button onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        )}
        <span>Evidence. Action. Follow-through.</span>
      </footer>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Application root missing.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
