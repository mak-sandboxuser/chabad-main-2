export default function ChabadSidebarLogo({ className = '' }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 4 L28 14 L22 14 L22 26 L10 26 L10 14 L4 14 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 8 L24 14 L20 14 L20 24 L12 24 L12 14 L8 14 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.75" />
      <path d="M16 12 L20 14 L18 14 L18 22 L14 22 L14 14 L12 14 Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" opacity="0.55" />
    </svg>
  );
}
