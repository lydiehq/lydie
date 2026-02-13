export function GradientOutline() {
  return (
    <>
      <div className="absolute -top-1.5 bg-linear-to-r h-px from-transparent via-black/5 to-transparent from-2% to-98% -left-100 -right-100 -z-10" />
      <div className="absolute -bottom-1.5 bg-linear-to-r h-px from-transparent via-black/5 to-transparent from-2% to-98% -left-100 -right-100 -z-10" />
      <div className="absolute -right-1.5 bg-linear-to-t w-px from-transparent via-black/5 to-transparent from-2% to-98% -top-100 -bottom-100 -z-10" />
      <div className="absolute -left-1.5 bg-linear-to-b w-px from-transparent via-black/5 to-transparent from-2% to-98% -top-100 -bottom-100 -z-10" />
    </>
  );
}
