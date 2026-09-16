import {
  StrictMode,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import { DEMO_NOTICE, demoProperty } from '@suraksha/contracts';
import { fetchHealth } from './api';
import './styles.css';

const spaces = [
  [
    demoProperty.name,
    'Paying guest',
    'Sample Nagar · New Delhi',
    '/images/hero-student-housing.webp',
  ],
  [
    'Nayi Disha Demo Hostel',
    'Hostel',
    'Example Enclave · New Delhi',
    '/images/demo-hostel-courtyard.webp',
  ],
  [
    'Udaan Demo Learning Centre',
    'Coaching',
    'Model Colony · New Delhi',
    '/images/demo-coaching-frontage.webp',
  ],
] as const;

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function App() {
  const [connection, setConnection] = useState('checking');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(
    'Search is a visual preview. No live properties are indexed.',
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchHealth(controller.signal)
      .then(() => setConnection('connected'))
      .catch(() => setConnection('unavailable'));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.14 },
    );
    elements.forEach((element) => observer.observe(element));
    const hero = document.querySelector<HTMLElement>('.hero');
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        hero?.style.setProperty(
          '--hero-shift',
          `${Math.min(window.scrollY * 0.12, 70)}px`,
        ),
      );
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update);
      cancelAnimationFrame(frame);
    };
  }, []);

  function search(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    setMessage(
      value
        ? `Showing fictional examples near “${value}”.`
        : 'Enter an address, landmark or property name.',
    );
    if (value)
      document
        .querySelector('#profiles')
        ?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="shell">
      <div className="intro-screen" aria-hidden="true">
        <span>SafePG.</span>
      </div>
      <header className="topbar">
        <a className="brand" href="#top">
          SafePG<span>.</span>
        </a>
        <nav aria-label="Primary">
          <a href="#process">How it works</a>
          <a href="#profiles">Demo profiles</a>
          <a href="#purpose">About</a>
        </nav>
        <a className="report-link" href="#resolution">
          Report an issue <Arrow />
        </a>
      </header>
      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <img
            src="/images/hero-student-housing.webp"
            alt="Fictional modern student residence at dusk"
            fetchPriority="high"
          />
          <div className="shade" />
          <p className="demo-pill">Concept preview · Fictional property</p>
          <div className="hero-copy">
            <p className="kicker">Safety evidence for student spaces</p>
            <h1 id="hero-title">
              See the place.
              <br />
              Know the concerns.
            </h1>
            <form className="search" onSubmit={search} role="search">
              <label htmlFor="search">
                Find a PG, hostel or coaching space
              </label>
              <div>
                <input
                  id="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Address, landmark or property name"
                />
                <button>
                  Search <Arrow />
                </button>
              </div>
              <p aria-live="polite">{message}</p>
            </form>
          </div>
        </section>

        <section className="statement" id="purpose" data-reveal>
          <p className="index">01 / Purpose</p>
          <h2>
            One clear record for every concern—from the first report to the
            verified fix.
          </h2>
          <p>
            SafePG brings location-specific reports, photo and video evidence,
            owner responses and professional inspection history into one
            understandable profile.
          </p>
        </section>

        <section className="process" id="process" data-reveal>
          <div>
            <p className="index">02 / How it works</p>
            <h2>Evidence before assumptions.</h2>
            <p>
              Unknown information stays unknown. Every status shows what was
              checked, when it was checked and what still needs attention.
            </p>
          </div>
          <div className="map" aria-label="Illustrative floor map preview">
            <span className="pin one" />
            <span className="pin two" />
            <article>
              <small>Location pin</small>
              <strong>Common staircase</strong>
              <span>Student-submitted · Review pending</span>
            </article>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Locate the building</h3>
                <p>Confirm the address, building and floor.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Review the evidence</h3>
                <p>See moderated media, source dates and verification level.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Follow the resolution</h3>
                <p>Track repair proof, recheck and complete history.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="profiles" id="profiles" data-reveal>
          <div className="section-head">
            <div>
              <p className="index">03 / Explore</p>
              <h2>
                Fictional spaces,
                <br />
                real product thinking.
              </h2>
            </div>
            <p>{DEMO_NOTICE}</p>
          </div>
          <div className="cards">
            {spaces.map(([name, type, area, image], i) => (
              <article
                className="card"
                key={name}
                data-reveal
                style={{ '--reveal-delay': `${i * 90}ms` } as CSSProperties}
              >
                <a href="#resolution">
                  <div className="photo">
                    <img src={image} alt="" loading={i ? 'lazy' : 'eager'} />
                    <span>0{i + 1}</span>
                  </div>
                  <div className="card-copy">
                    <small>{type}</small>
                    <h3>{name}</h3>
                    <p>{area}</p>
                    <em>Demo profile · Evidence pending</em>
                    <Arrow />
                  </div>
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="resolution" id="resolution" data-reveal>
          <div>
            <p className="index">04 / Resolution</p>
            <h2>A report should lead somewhere.</h2>
            <p>
              Students see what changed. Owners submit repair proof. Reviewers
              preserve the evidence and decision history.
            </p>
          </div>
          <article className="timeline">
            <header>
              <span>Demo issue timeline</span>
              <b>In review</b>
            </header>
            <ol>
              <li className="done">
                Issue reported <small>Photo and location received</small>
              </li>
              <li className="active">
                Evidence review <small>Public details being checked</small>
              </li>
              <li>
                Owner response <small>Not received</small>
              </li>
              <li>
                Fix verification <small>Not started</small>
              </li>
            </ol>
            <p>Demonstration only · No real building finding</p>
          </article>
        </section>
      </main>
      <footer>
        <div>
          <a className="brand" href="#top">
            SafePG<span>.</span>
          </a>
          <p>Evidence-led safety profiles for student spaces.</p>
        </div>
        <nav>
          <a href="#process">Process</a>
          <a href="#profiles">Profiles</a>
          <a href="#purpose">About</a>
        </nav>
        <p className="service">
          <i className={connection} />
          API {connection}
        </p>
        <small>
          Product prototype · No emergency monitoring or verified live listings
        </small>
      </footer>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Application root missing.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
