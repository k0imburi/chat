export function VaultIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 7.25A2.25 2.25 0 0 1 6.25 5h11.5A2.25 2.25 0 0 1 20 7.25v10.5A2.25 2.25 0 0 1 17.75 20H6.25A2.25 2.25 0 0 1 4 17.75V7.25Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 5v15M4 9h2m-2 7h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="14" cy="12.5" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M14 8.5V10m0 5v1.5m-4-4h1.5m5 0H18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
