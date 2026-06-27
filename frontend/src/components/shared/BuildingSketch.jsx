export default function BuildingSketch({ theme, className = '' }) {
  return (
    <img
      src={theme === 'light' ? '/building-sketch-light.png' : '/building-sketch-dark.png'}
      alt=""
      className={className}
      aria-hidden="true"
      draggable={false}
    />
  );
}
