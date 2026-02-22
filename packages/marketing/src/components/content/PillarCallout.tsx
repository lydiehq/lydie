type PillarCalloutProps = {
  type?: string;
  heading?: string;
  body?: string;
};

function getCalloutStyle(type: string): {
  label: string;
  heading: string;
  body: string;
} {
  switch (type) {
    case "definition":
      return {
        label: "text-sky-700",
        heading: "text-sky-950",
        body: "text-sky-900/90",
      };
    case "tip":
      return {
        label: "text-emerald-700",
        heading: "text-emerald-950",
        body: "text-emerald-900/90",
      };
    case "warning":
      return {
        label: "text-amber-700",
        heading: "text-amber-950",
        body: "text-amber-900/90",
      };
    default:
      return {
        label: "text-slate-700",
        heading: "text-slate-900",
        body: "text-slate-700",
      };
  }
}

export function PillarCallout({ type = "note", heading, body }: PillarCalloutProps) {
  if (!heading && !body) {
    return null;
  }

  const style = getCalloutStyle(type);

  return (
    <aside className="my-8 relative">
      <div className="absolute -top-1.5 bg-linear-to-r h-px from-transparent via-black/5 to-transparent from-2% to-98% -left-100 -right-100 -z-10"></div>
      <div className="absolute -bottom-1.5 bg-linear-to-r h-px from-transparent via-black/5 to-transparent from-2% to-98% -left-100 -right-100 -z-10"></div>
      <div className="absolute -right-1.5 bg-linear-to-t w-px from-transparent via-black/5 to-transparent from-2% to-98% -top-100 -bottom-100 -z-10"></div>
      <div className="absolute -left-1.5 bg-linear-to-b w-px from-transparent via-black/5 to-transparent from-2% to-98% -top-100 -bottom-100 -z-10"></div>
      <div className="rounded-xl shadow-legit overflow-hidden bg-white p-5 ring ring-black/5">
        <p className={`m-0 text-xs font-semibold uppercase tracking-wide ${style.label}`}>{type}</p>
        {heading ? (
          <h3 className={`mt-2 mb-0 text-lg font-semibold ${style.heading}`}>{heading}</h3>
        ) : null}
        {body ? <p className={`mt-2 mb-0 leading-relaxed ${style.body}`}>{body}</p> : null}
      </div>
    </aside>
  );
}
