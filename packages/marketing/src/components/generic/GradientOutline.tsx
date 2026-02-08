export function GradientOutline() {
  return (
    <>
      <div className="absolute -top-px bg-linear-to-r h-px from-transparent via-black/6 to-transparent from-2% to-98% -left-100 -right-100 -z-10" />
      <div className="absolute -bottom-px bg-linear-to-r h-px from-transparent via-black/6 to-transparent from-2% to-98% -left-100 -right-100 -z-10" />
      <div className="absolute -right-px bg-linear-to-t w-px from-transparent via-black/6 to-transparent from-2% to-98% -top-100 -bottom-100 -z-10" />
      <div className="absolute -left-px bg-linear-to-b w-px from-transparent via-black/6 to-transparent from-2% to-98% -top-100 -bottom-100 -z-10" />
    </>
  );
}
