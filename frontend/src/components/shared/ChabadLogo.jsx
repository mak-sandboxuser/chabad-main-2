const LOGO_PNG = '/chabad-bedford-logo.png';
const LOGO_SVG = '/chabad-bedford-logo.svg';

export default function ChabadLogo({
  className = '',
  size,
  width,
  height,
  useSvg = false,
  alt = 'Chabad of Bedford',
}) {
  const src = useSvg ? LOGO_SVG : LOGO_PNG;
  const style = {};

  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;
  if (size && !width && !height) {
    style.width = typeof size === 'number' ? `${size}px` : size;
    style.height = 'auto';
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={Object.keys(style).length ? style : undefined}
      draggable={false}
      decoding="async"
    />
  );
}

export { LOGO_PNG, LOGO_SVG };
