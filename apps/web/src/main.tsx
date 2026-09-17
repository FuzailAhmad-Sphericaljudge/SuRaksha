import {
  StrictMode,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  DEMO_NOTICE,
  demoProperty,
  type SessionResponse,
} from '@suraksha/contracts';
import {
  fetchBootstrap,
  fetchHealth,
  fetchSession,
  fetchCandidates,
  createCandidate,
  createPropertyClaim,
  createBuilding,
  decideClaim,
  fetchMyClaims,
  fetchMyBuildings,
  fetchReviewerClaims,
  loginDemoAccount,
  logoutDemoAccount,
  registerDemoAccount,
  saveOnboarding,
  searchCandidates,
  type PropertyCandidate,
  type PropertyClaim,
  type ManagedBuilding,
} from './api';
import './styles.css';

const spaces = [
  {
    id: demoProperty.id,
    name: demoProperty.name,
    type: 'paying_guest',
    label: 'Paying guest',
    area: 'Sample Nagar · New Delhi',
    image: '/images/hero-student-housing.webp',
    identity: 'unconfirmed',
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    name: 'Nayi Disha Demo Hostel',
    type: 'hostel',
    label: 'Hostel',
    area: 'Example Enclave · New Delhi',
    image: '/images/demo-hostel-courtyard.webp',
    identity: 'unconfirmed',
  },
  {
    id: '10000000-0000-4000-8000-000000000007',
    name: 'Udaan Demo Learning Centre',
    type: 'coaching_institute',
    label: 'Coaching',
    area: 'Model Colony · New Delhi',
    image: '/images/demo-coaching-frontage.webp',
    identity: 'unconfirmed',
  },
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
  const [mode, setMode] = useState<'demo' | 'production' | 'unknown'>(
    'unknown',
  );
  const [session, setSession] = useState<SessionResponse>({
    authenticated: false,
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [authKind, setAuthKind] = useState<'register' | 'login'>('register');
  const [authError, setAuthError] = useState('');
  const [candidates, setCandidates] = useState<PropertyCandidate[]>([]);
  const [candidateMessage, setCandidateMessage] = useState('');
  const [claims, setClaims] = useState<PropertyClaim[]>([]);
  const [claimMessage, setClaimMessage] = useState('');
  const [reviewClaims, setReviewClaims] = useState<PropertyClaim[]>([]);
  const [buildings, setBuildings] = useState<ManagedBuilding[]>([]);
  const [buildingMessage, setBuildingMessage] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(
    'Search is a visual preview. No live properties are indexed.',
  );
  const [filter, setFilter] = useState<
    'all' | 'paying_guest' | 'hostel' | 'coaching_institute'
  >('all');
  const [selectedId, setSelectedId] = useState(demoProperty.id);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchHealth(controller.signal),
      fetchBootstrap(controller.signal),
      fetchSession(controller.signal),
      fetchCandidates(controller.signal),
    ])
      .then(([, bootstrap, activeSession, loadedCandidates]) => {
        setConnection('connected');
        setMode(bootstrap.mode);
        setSession(activeSession);
        setCandidates(loadedCandidates);
      })
      .catch(() => setConnection('unavailable'));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (session.authenticated && session.profile?.role === 'owner_manager') {
      void fetchMyClaims()
        .then(setClaims)
        .catch(() => setClaimMessage('Claims could not be loaded.'));
      void fetchMyBuildings()
        .then(setBuildings)
        .catch(() => setBuildingMessage('Buildings could not be loaded.'));
    }
    if (
      session.authenticated &&
      session.user.email === 'reviewer@suraksha.demo'
    )
      void fetchReviewerClaims()
        .then(setReviewClaims)
        .catch(() => setClaimMessage('Reviewer queue could not be loaded.'));
  }, [session]);

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

  async function search(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    try {
      const results = await searchCandidates(
        value,
        filter === 'all' ? undefined : filter,
      );
      setCandidates(results);
      setMessage(
        `${results.length} submitted candidate${results.length === 1 ? '' : 's'} found. Candidate does not mean verified.`,
      );
      document
        .querySelector('#candidate-results')
        ?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      setMessage('Search is temporarily unavailable.');
    }
    return;
    setMessage(
      value
        ? `Showing fictional examples matching “${value}”.`
        : 'Showing all fictional demo spaces.',
    );
    if (value)
      document
        .querySelector('#profiles')
        ?.scrollIntoView({ behavior: 'smooth' });
  }

  const normalized = query.trim().toLocaleLowerCase();
  const visibleSpaces = spaces.filter(
    (space) =>
      (filter === 'all' || space.type === filter) &&
      (!normalized ||
        `${space.name} ${space.area}`.toLocaleLowerCase().includes(normalized)),
  );
  const selected = spaces.find((space) => space.id === selectedId) ?? spaces[0];

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');
    const data = new FormData(event.currentTarget);
    try {
      const email = String(data.get('email'));
      const password = String(data.get('password'));
      setSession(
        authKind === 'register'
          ? await registerDemoAccount({
              displayName: String(data.get('displayName')),
              email,
              password,
            })
          : await loginDemoAccount({ email, password }),
      );
      setAuthOpen(false);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Registration failed.',
      );
    }
  }

  async function logout() {
    await logoutDemoAccount();
    setSession({ authenticated: false });
  }

  async function chooseRole(
    role: 'student' | 'parent_guardian' | 'owner_manager' | 'professional',
  ) {
    try {
      setSession(await saveOnboarding(role));
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Onboarding failed.',
      );
    }
  }

  const roleLabels = {
    student: 'Student',
    parent_guardian: 'Parent / guardian',
    owner_manager: 'Owner / manager',
    professional: 'Safety professional',
  } as const;

  async function submitCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCandidateMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const candidate = await createCandidate({
        name: String(data.get('name')),
        locality: String(data.get('locality')),
        propertyType: String(
          data.get('propertyType'),
        ) as PropertyCandidate['propertyType'],
      });
      setCandidates((current) => [candidate, ...current]);
      setCandidateMessage(
        'Candidate saved. It is unverified and queued for review.',
      );
      form.reset();
    } catch (error) {
      setCandidateMessage(
        error instanceof Error ? error.message : 'Submission failed.',
      );
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClaimMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await createPropertyClaim({
        candidateId: String(data.get('candidateId')),
        evidenceNote: String(data.get('evidenceNote')),
      });
      setClaims(await fetchMyClaims());
      setClaimMessage('Claim submitted for reviewer verification.');
      form.reset();
    } catch (error) {
      setClaimMessage(error instanceof Error ? error.message : 'Claim failed.');
    }
  }

  async function reviewClaim(id: string, status: 'approved' | 'rejected') {
    const reason = window.prompt(`Reason for ${status}:`);
    if (!reason) return;
    try {
      await decideClaim(id, status, reason);
      setReviewClaims(await fetchReviewerClaims());
    } catch (error) {
      setClaimMessage(
        error instanceof Error ? error.message : 'Decision failed.',
      );
    }
  }

  async function submitBuilding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBuildingMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await createBuilding({
        candidateId: String(data.get('candidateId')),
        name: String(data.get('name')),
        floors: Number(data.get('floors')),
      });
      setBuildings(await fetchMyBuildings());
      setBuildingMessage('Building saved.');
      form.reset();
    } catch (error) {
      setBuildingMessage(
        error instanceof Error ? error.message : 'Building failed.',
      );
    }
  }

  return (
    <div className="shell">
      {mode === 'demo' && (
        <div className="mode-banner" role="status">
          Demo mode · Fictional resettable data
        </div>
      )}
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
        {session.authenticated ? (
          <button className="account-button" onClick={() => void logout()}>
            {session.user.displayName} · Sign out
          </button>
        ) : (
          <button
            className="account-button"
            onClick={() => setAuthOpen((open) => !open)}
          >
            Create demo account
          </button>
        )}
      </header>
      {authOpen && mode === 'demo' && (
        <form className="auth-panel" onSubmit={register}>
          <strong>
            {authKind === 'register'
              ? 'Create a demo account'
              : 'Sign in to demo'}
          </strong>
          {authKind === 'register' && (
            <input
              name="displayName"
              placeholder="Your name"
              minLength={2}
              required
            />
          )}
          <input name="email" type="email" placeholder="Email" required />
          <input
            name="password"
            type="password"
            placeholder="Password (8+ characters)"
            minLength={8}
            required
          />
          <button type="submit">
            {authKind === 'register' ? 'Create and sign in' : 'Sign in'}
          </button>
          <button
            className="auth-switch"
            type="button"
            onClick={() => {
              setAuthKind((kind) =>
                kind === 'register' ? 'login' : 'register',
              );
              setAuthError('');
            }}
          >
            {authKind === 'register'
              ? 'Already registered? Sign in'
              : 'Need an account? Register'}
          </button>
          {authError && <p role="alert">{authError}</p>}
        </form>
      )}
      {session.authenticated && !session.profile && (
        <section className="role-panel" aria-labelledby="role-title">
          <p className="kicker">Account setup</p>
          <h2 id="role-title">How will you use SafePG?</h2>
          <div className="role-grid">
            {(Object.keys(roleLabels) as Array<keyof typeof roleLabels>).map(
              (role) => (
                <button key={role} onClick={() => void chooseRole(role)}>
                  {roleLabels[role]}
                </button>
              ),
            )}
          </div>
          {authError && <p role="alert">{authError}</p>}
        </section>
      )}
      {session.authenticated && session.profile && (
        <section className="dashboard-strip" aria-label="Account dashboard">
          <div>
            <span>Your dashboard</span>
            <strong>{roleLabels[session.profile.role]}</strong>
          </div>
          <p>
            {session.profile.reviewStatus === 'pending_review'
              ? 'Review pending — restricted actions stay locked.'
              : 'Account active — your workspace is ready.'}
          </p>
        </section>
      )}
      {session.authenticated && session.profile && (
        <section className="candidate-intake" aria-labelledby="candidate-title">
          <div>
            <p className="kicker">Real data intake</p>
            <h2 id="candidate-title">Know a missing student space?</h2>
            <p>
              Submit its public name and locality. It will remain unverified
              until review.
            </p>
          </div>
          <form onSubmit={submitCandidate}>
            <input
              name="name"
              placeholder="PG, hostel or coaching name"
              minLength={3}
              required
            />
            <input
              name="locality"
              placeholder="Locality and city"
              minLength={3}
              required
            />
            <select name="propertyType" defaultValue="paying_guest">
              <option value="paying_guest">Paying guest</option>
              <option value="hostel">Hostel</option>
              <option value="coaching_institute">Coaching institute</option>
            </select>
            <button type="submit">Submit candidate</button>
            {candidateMessage && <p role="status">{candidateMessage}</p>}
          </form>
          <div className="candidate-list">
            {candidates.length === 0 ? (
              <p>No submitted candidates yet.</p>
            ) : (
              candidates.map((candidate) => (
                <article key={candidate.id}>
                  <span>Candidate · Unverified</span>
                  <strong>{candidate.name}</strong>
                  <p>{candidate.locality}</p>
                </article>
              ))
            )}
          </div>
        </section>
      )}
      {session.authenticated && session.profile?.role === 'owner_manager' && (
        <section className="claim-panel" aria-labelledby="claim-title">
          <div>
            <p className="kicker">Owner verification</p>
            <h2 id="claim-title">Claim a submitted property</h2>
            <p>
              Your claim stays pending until a reviewer checks management
              evidence.
            </p>
          </div>
          <form onSubmit={submitClaim}>
            <select name="candidateId" required defaultValue="">
              <option value="" disabled>
                Select property candidate
              </option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} — {candidate.locality}
                </option>
              ))}
            </select>
            <textarea
              name="evidenceNote"
              minLength={20}
              maxLength={1000}
              required
              placeholder="Explain your management connection and which documents you can provide."
            />
            <button type="submit">Submit owner claim</button>
            {claimMessage && <p role="status">{claimMessage}</p>}
          </form>
          <div className="claim-list">
            {claims.map((claim) => (
              <article key={claim.id}>
                <span>{claim.status.replaceAll('_', ' ')}</span>
                <strong>{claim.candidateName ?? claim.candidateId}</strong>
                <p>{claim.evidenceNote}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      {session.authenticated &&
        session.user.email === 'reviewer@suraksha.demo' && (
          <section className="claim-panel" aria-labelledby="review-title">
            <div>
              <p className="kicker">Demo reviewer</p>
              <h2 id="review-title">Owner claim queue</h2>
              <p>A reason is required for every decision.</p>
            </div>
            <div className="claim-list">
              {reviewClaims.length === 0 ? (
                <p>No pending claims.</p>
              ) : (
                reviewClaims.map((claim) => (
                  <article key={claim.id}>
                    <span>{claim.status}</span>
                    <strong>{claim.candidateName}</strong>
                    <p>{claim.evidenceNote}</p>
                    <div className="decision-actions">
                      <button
                        onClick={() => void reviewClaim(claim.id, 'approved')}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => void reviewClaim(claim.id, 'rejected')}
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}
      {session.authenticated &&
        session.profile?.role === 'owner_manager' &&
        session.profile.reviewStatus === 'active' && (
          <section className="claim-panel" aria-labelledby="building-title">
            <div>
              <p className="kicker">Property management</p>
              <h2 id="building-title">Add a building</h2>
              <p>Only properties with an approved owner claim are accepted.</p>
            </div>
            <form onSubmit={submitBuilding}>
              <select name="candidateId" required defaultValue="">
                <option value="" disabled>
                  Select approved property
                </option>
                {claims
                  .filter((claim) => claim.status === 'approved')
                  .map((claim) => (
                    <option key={claim.id} value={claim.candidateId}>
                      {claim.candidateName}
                    </option>
                  ))}
              </select>
              <input
                name="name"
                minLength={2}
                required
                placeholder="Building name or block"
              />
              <input
                name="floors"
                type="number"
                min={1}
                max={300}
                required
                placeholder="Floors"
              />
              <button type="submit">Add building</button>
              {buildingMessage && <p role="status">{buildingMessage}</p>}
            </form>
            <div className="claim-list">
              {buildings.map((building) => (
                <article key={building.id}>
                  <span>Managed building</span>
                  <strong>{building.name}</strong>
                  <p>{building.floors} floors</p>
                </article>
              ))}
            </div>
          </section>
        )}
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

        <section
          className="live-results"
          id="candidate-results"
          aria-labelledby="candidate-results-title"
        >
          <div>
            <p className="index">Live candidate database</p>
            <h2 id="candidate-results-title">Submitted spaces</h2>
            <p>
              These records come from the local database and remain unverified
              until review.
            </p>
          </div>
          <div className="candidate-list">
            {candidates.length === 0 ? (
              <p>No matching submitted candidates.</p>
            ) : (
              candidates.map((candidate) => (
                <article key={candidate.id}>
                  <span>Candidate · Unverified</span>
                  <strong>{candidate.name}</strong>
                  <p>{candidate.locality}</p>
                  <small>{candidate.propertyType.replaceAll('_', ' ')}</small>
                </article>
              ))
            )}
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
          <div className="discovery">
            <div
              className="discovery-controls"
              role="group"
              aria-label="Filter demo spaces"
            >
              {(
                [
                  ['all', 'All spaces'],
                  ['paying_guest', 'PGs'],
                  ['hostel', 'Hostels'],
                  ['coaching_institute', 'Coaching'],
                ] as const
              ).map(([value, label]) => (
                <button
                  className={filter === value ? 'selected' : ''}
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
              <span>
                {visibleSpaces.length} fictional{' '}
                {visibleSpaces.length === 1 ? 'space' : 'spaces'}
              </span>
            </div>
            <div className="cards">
              {visibleSpaces.map((space, i) => (
                <article
                  className="card"
                  key={space.id}
                  data-reveal
                  style={{ '--reveal-delay': `${i * 90}ms` } as CSSProperties}
                >
                  <a
                    href="#profile-detail"
                    onClick={() => setSelectedId(space.id)}
                  >
                    <div className="photo">
                      <img
                        src={space.image}
                        alt=""
                        loading={i ? 'lazy' : 'eager'}
                      />
                      <span>0{i + 1}</span>
                    </div>
                    <div className="card-copy">
                      <small>{space.label}</small>
                      <h3>{space.name}</h3>
                      <p>{space.area}</p>
                      <em>Demo profile · Evidence pending</em>
                      <Arrow />
                    </div>
                  </a>
                </article>
              ))}
            </div>
            {visibleSpaces.length === 0 && (
              <p className="empty-state">
                No fictional demo space matches that search. Try a broader
                address or choose All spaces.
              </p>
            )}
          </div>
        </section>

        <section
          className="profile-detail"
          id="profile-detail"
          data-reveal
          aria-labelledby="selected-profile-title"
        >
          <div>
            <p className="index">Selected profile · Identity check</p>
            <h2 id="selected-profile-title">{selected.name}</h2>
            <p>{selected.area}</p>
          </div>
          <div className="identity-card">
            <span className="identity-mark">?</span>
            <div>
              <strong>Building identity {selected.identity}</strong>
              <p>
                This fictional profile is awaiting address and building
                confirmation. Reports must attach to the correct building before
                they are published.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setMessage(
                  'Identity confirmation will be available when the registry is connected.',
                )
              }
            >
              Confirm building
            </button>
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
