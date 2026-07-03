export default function BuildingSketch({ theme, className = '' }) {
  return (
    <img
      src={theme === 'light' ? '/building_sketch.png' : '/building_sketch-dark.png'}
      alt=""
      className={className}
      aria-hidden="true"
      draggable={false}
    />
  );
}
