export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="3" fill="currentColor" />
        <circle cx="3.5" cy="5" r="1.8" fill="currentColor" opacity=".55" />
        <circle cx="18.5" cy="6" r="1.8" fill="currentColor" opacity=".55" />
        <circle cx="16" cy="18.5" r="1.8" fill="currentColor" opacity=".55" />
        <path d="M11 11 3.5 5M11 11l7.5-5M11 11l5 7.5" stroke="currentColor" strokeWidth="1.2" opacity=".55" />
      </svg>
      Rastro
    </span>
  );
}
