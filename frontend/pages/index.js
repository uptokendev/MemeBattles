import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useProvider } from 'wagmi';
import WalletMenu from '../components/WalletMenu'; // ⬅️ make sure path is correct

export default function Home() {
  const [launches, setLaunches] = useState([]);
  const provider = useProvider();

  useEffect(() => {
    // placeholder: fetch launches from indexer or blockchain events
    setLaunches([
      {
        id: 1,
        token: 'LAUNCH',
        sale: '0xSaleAddress',
        creator: '0xCreator000000000000000000000000000000000000', // optional: more realistic dummy
        external: false,
      },
    ]);
  }, []);

  return (
    <div>
      {/* Navigation bar */}
      <header className="nav">
        {/* Left: clickable logo/brand */}
        <div className="nav-left">
          <Link href="/" className="brand">
            LaunchIt
          </Link>
        </div>

        {/* Middle: nav links */}
        <nav className="nav-links">
          <Link href="/">Home</Link>
          <Link href="/create">Create</Link>
          {/* Add more links as needed */}
        </nav>

        {/* Right: wallet connect / address dropdown */}
        <div className="nav-right">
          <WalletMenu />
        </div>
      </header>

      {/* Hero section */}
      <section className="hero">
        <h1>Next-Generation Token Launchpad</h1>
        <p>
          Create, discover and invest in token launches with transparent bonding curves
          and secure liquidity locking. Empower your project from day one.
        </p>
        <div className="hero-buttons">
          <Link href="/create" className="button">
            Launch your token
          </Link>
          <Link href="#launches" className="button-secondary">
            Explore launches
          </Link>
        </div>
      </section>

      {/* Launch list */}
      <section
        id="launches"
        style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}
      >
        <h2
          style={{
            fontSize: '1.75rem',
            marginBottom: '1.5rem',
            color: '#d8d1f1',
          }}
        >
          Active Launches
        </h2>

        {launches.map((launch) => (
          <div key={launch.id} className="card" style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{launch.token}</h3>
                <p style={{ margin: '0.5rem 0', color: '#a89bcf' }}>
                  Sale: {launch.sale}
                </p>
                <p style={{ margin: '0 0 0.5rem', color: '#a89bcf' }}>
                  Creator: {launch.creator.slice(0, 6)}...
                  {launch.creator.slice(-4)}
                </p>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    background: launch.external
                      ? 'rgba(139, 92, 246, 0.2)'
                      : 'rgba(34, 197, 94, 0.2)',
                    color: launch.external ? '#a78bfa' : '#4ade80',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                  }}
                >
                  {launch.external ? 'External Token' : 'LaunchIt Token'}
                </span>
              </div>
              <Link href={`/sale/${launch.sale}`} className="button">
                View Sale
              </Link>
            </div>
          </div>
        ))}

        {launches.length === 0 && (
          <p style={{ color: '#8e81b6' }}>No launches found. Check back soon!</p>
        )}
      </section>
    </div>
  );
}
