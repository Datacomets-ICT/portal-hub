// Simple line icons; stroke currentColor
const Ico = {
  Car: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 16h14M5 16v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2M19 16v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2"/>
      <path d="M4 16l1.2-4.3A3 3 0 0 1 8.1 9.5h7.8a3 3 0 0 1 2.9 2.2L20 16"/>
      <circle cx="7.5" cy="13.5" r=".6" fill="currentColor"/>
      <circle cx="16.5" cy="13.5" r=".6" fill="currentColor"/>
    </svg>
  ),
  Route: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="6" cy="6" r="2.2"/>
      <circle cx="18" cy="18" r="2.2"/>
      <path d="M8.2 6H14a4 4 0 0 1 0 8H10a4 4 0 0 0 0 8h5.8"/>
    </svg>
  ),
  Clock: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
  ),
  Calendar: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>
    </svg>
  ),
  Pin: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z"/>
      <circle cx="12" cy="10" r="2.5"/>
    </svg>
  ),
  User: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>
    </svg>
  ),
  Check: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 12.5 10 18 20 6"/>
    </svg>
  ),
  ArrowRight: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
  ),
  ArrowLeft: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6"/>
    </svg>
  ),
  Search: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.5-3.5"/>
    </svg>
  ),
  Plus: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  Link: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7"/>
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L12.5 17"/>
    </svg>
  ),
  Home: (p) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 11 12 4l8 7"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>
    </svg>
  ),
  Dot: (p) => <span style={{display:"inline-block",width:6,height:6,borderRadius:3,background:"currentColor"}} {...p}/>,
  Logo: (p) => (
    <svg viewBox="0 0 40 40" width="1em" height="1em" fill="none" {...p}>
      <rect x="2" y="2" width="36" height="36" rx="10" fill="#1e4cbd"/>
      <path d="M11 24h18M11 24l1.5-5.6A3 3 0 0 1 15.4 16h9.2a3 3 0 0 1 2.9 2.4L29 24" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="14.5" cy="21.8" r=".8" fill="#fff"/><circle cx="25.5" cy="21.8" r=".8" fill="#fff"/>
    </svg>
  ),
};

window.Ico = Ico;
