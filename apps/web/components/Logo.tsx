/** Brand mark: a house with a screening pin. Same artwork as app/icon.svg (the favicon). */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#2f6f68" />
      <path d="M14 31 32 16l18 15" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 28v19h26V28" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="45" cy="45" r="9" fill="#d99a1e" stroke="#2f6f68" strokeWidth="3" />
    </svg>
  );
}
