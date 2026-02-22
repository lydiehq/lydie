type TLDRCalloutProps = {
  body?: string;
};

export function TLDRCallout({ body }: TLDRCalloutProps) {
  if (!body) {
    return null;
  }

  return (
    <aside className="my-8 relative">
      <div className="absolute -top-1.5 bg-linear-to-r h-px from-transparent via-black/5 to-transparent from-2% to-98% -left-100 -right-100 -z-10"></div>
      <div className="absolute -bottom-1.5 bg-linear-to-r h-px from-transparent via-black/5 to-transparent from-2% to-98% -left-100 -right-100 -z-10"></div>
      <div className="absolute -right-1.5 bg-linear-to-t w-px from-transparent via-black/5 to-transparent from-2% to-98% -top-100 -bottom-100 -z-10"></div>
      <div className="absolute -left-1.5 bg-linear-to-b w-px from-transparent via-black/5 to-transparent from-2% to-98% -top-100 -bottom-100 -z-10"></div>
      <div className="rounded-xl shadow-legit overflow-hidden bg-white p-5 ring ring-black/5">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-rose-700">TLDR</p>
        <p className="mt-2 mb-0 leading-relaxed text-rose-950">{body}</p>
      </div>
    </aside>
  );
}
