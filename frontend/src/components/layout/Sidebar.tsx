import { NavLink } from 'react-router-dom';
import type { CSSProperties } from 'react';

const nav: CSSProperties = {
  width: 200,
  minHeight: '100vh',
  background: 'var(--surface)',
  borderRight: '1px solid var(--line)',
  display: 'flex',
  flexDirection: 'column',
  padding: '20px 0',
  position: 'fixed',
  top: 0,
  left: 0,
  zIndex: 10,
};

const logo: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontSize: 22,
  color: 'var(--gold)',
  padding: '0 20px 20px',
  borderBottom: '1px solid var(--line)',
  marginBottom: 8,
};

const linkBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 20px',
  fontFamily: 'var(--sans)',
  fontSize: 14,
  color: 'var(--t2)',
  textDecoration: 'none',
  borderLeft: '3px solid transparent',
  transition: 'all 0.15s',
};

const links = [
  { to: '/', label: 'Dashboard', icon: '\u25A0' },
  { to: '/bots', label: 'Bots', icon: '\u2022' },
  { to: '/strategies', label: 'Strategies', icon: '\u25B6' },
  { to: '/skills', label: 'Skills', icon: '\u2261' },
  { to: '/health', label: 'Health', icon: '\u2713' },
  { to: '/chat', label: 'Chat', icon: '\u276F' },
];

export function Sidebar() {
  return (
    <nav style={nav}>
      <div style={logo}>Flash</div>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
          style={({ isActive }) => ({
            ...linkBase,
            color: isActive ? 'var(--gold)' : 'var(--t2)',
            borderLeftColor: isActive ? 'var(--gold)' : 'transparent',
            background: isActive ? 'var(--gold-dim)' : 'transparent',
          })}
        >
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, width: 16, textAlign: 'center' }}>{l.icon}</span>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
