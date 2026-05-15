function joinClasses(...values) {
  return values.filter(Boolean).join(' ');
}

export default function PageShell({
  children,
  className = '',
  contentClassName = '',
  width = 'full',
  gap = 'md',
}) {
  const widthClass =
    width === 'wide'
      ? 'max-w-[1680px]'
      : width === 'narrow'
        ? 'max-w-6xl'
        : 'max-w-[1520px]';

  const gapClass = gap === 'sm' ? 'space-y-4' : gap === 'lg' ? 'space-y-8' : 'space-y-6';

  return (
    <div className={joinClasses('min-w-0', className)}>
      <div className={joinClasses('mx-auto w-full px-4 pb-6 pt-4 sm:px-6 lg:px-8', widthClass, contentClassName)}>
        <div className={gapClass}>{children}</div>
      </div>
    </div>
  );
}
