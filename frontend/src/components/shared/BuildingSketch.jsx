export default function BuildingSketch({ theme, className = '' }) {
  return (
    <img
      src="/building_sketch_clean.png"
      alt=""
      className={className}
      aria-hidden="true"
      draggable={false}
    />
  );
}
