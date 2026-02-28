import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.tsx';
import { TopBar } from './TopBar.tsx';
import type { CSSProperties } from 'react';

const container: CSSProperties = {
  display: 'flex',
  minHeight: '100vh',
  background: 'var(--bg)',
};

const main: CSSProperties = {
  marginLeft: 200,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
};

const content: CSSProperties = {
  flex: 1,
  padding: 24,
  maxWidth: 1200,
  width: '100%',
};

export function Shell() {
  return (
    <div style={container}>
      <Sidebar />
      <div style={main}>
        <TopBar />
        <div style={content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
