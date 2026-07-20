export default function BuildingSketch({ theme, className = '' }) {
  const src = theme === 'light' ? '/building-sketch-light.png' : '/building_sketch_clean.png';
  return (
    <img
      src={src}
      alt=""
      className={className}
      aria-hidden="true"
      draggable={false}
    />
  );
}
