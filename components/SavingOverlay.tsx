'use client';

const ICONS: { key: string; path: React.ReactNode; viewBox?: string }[] = [
  {
    key: 'camera',
    viewBox: '0 0 24 24',
    path: (
      <>
        <rect x="2.5" y="6" width="14" height="12" rx="2" />
        <circle cx="9.5" cy="12" r="3.4" />
        <path d="M16.5 10 L21.5 7.5 V16.5 L16.5 14" strokeLinejoin="round" />
      </>
    ),
  },
  {
    key: 'shield',
    viewBox: '0 0 24 24',
    path: (
      <>
        <path d="M12 2 L20 5.5 V11 C20 16 16.5 19.8 12 22 C7.5 19.8 4 16 4 11 V5.5 Z" strokeLinejoin="round" />
        <path d="M8.3 12 L10.7 14.4 L15.7 9" strokeLinejoin="round" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: 'monitor',
    viewBox: '0 0 24 24',
    path: (
      <>
        <rect x="2.5" y="4" width="19" height="13" rx="1.5" />
        <path d="M8 21 H16 M12 17 V21" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: 'flame',
    viewBox: '0 0 24 24',
    path: (
      <path d="M12 2 C13.5 6 17 7.5 17 12.5 C17 17 14.8 20 12 22 C9.2 20 7 17 7 12.5 C7 10.5 8 9.3 8.7 8 C9 10 10 10.5 10 10.5 C9.5 7 11 4 12 2 Z" strokeLinejoin="round" />
    ),
  },
  {
    key: 'alarm',
    viewBox: '0 0 24 24',
    path: (
      <>
        <path d="M4.5 15 C4.5 9.5 8 6.5 12 6.5 C16 6.5 19.5 9.5 19.5 15" strokeLinecap="round" />
        <path d="M3 15 H21" strokeLinecap="round" />
        <path d="M9.5 15 V18 M14.5 15 V18" strokeLinecap="round" />
        <circle cx="12" cy="3.5" r="1.4" />
      </>
    ),
  },
  {
    key: 'arm',
    viewBox: '0 0 24 24',
    path: (
      <>
        <path d="M4 20 L9 11 L17 6.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="19" cy="5" r="2.4" />
      </>
    ),
  },
];

export default function SavingOverlay({ show, label }: { show: boolean; label?: string }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-bg/92 backdrop-blur-sm">
      <div className="flex items-end gap-4 mb-7">
        {ICONS.map((icon, i) => (
          <svg
            key={icon.key}
            viewBox={icon.viewBox}
            width="30"
            height="30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="text-ink"
            style={{
              animation: 'saving-bounce 1.1s ease-in-out infinite',
              animationDelay: `${i * 0.12}s`,
            }}
          >
            {icon.path}
          </svg>
        ))}
      </div>
      <p className="text-ink font-display font-semibold text-sm tracking-wide uppercase">
        {label || 'Guardando reporte…'}
      </p>
      <p className="text-muted text-xs mt-1.5">No cierres ni cambies de pantalla</p>

      <style>{`
        @keyframes saving-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.45; }
          50% { transform: translateY(-10px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
