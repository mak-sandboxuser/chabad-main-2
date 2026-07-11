import ChabadLogo from './ChabadLogo';

export default function ChabadSidebarLogo({ className = '' }) {
  return (
    <ChabadLogo
      className={`chabad-logo chabad-logo--sidebar ${className}`.trim()}
      alt="Chabad Bedford"
    />
  );
}
