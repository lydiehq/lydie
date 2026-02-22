type FlowchartNode = {
  id: string;
  type: "question" | "result";
  text: string;
  url?: string;
};

type FlowchartEdge = {
  from: string;
  to: string;
  label: string;
};

export type FlowchartProps = {
  title?: string;
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
};

export function Flowchart({ title, nodes, edges }: FlowchartProps) {
  if (nodes.length === 0) {
    return null;
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const validEdges = edges.filter((edge) => nodeMap.has(edge.from) && nodeMap.has(edge.to));

  const incoming = new Map<string, number>();
  for (const node of nodes) {
    incoming.set(node.id, 0);
  }

  for (const edge of validEdges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  }

  const primaryParentByNode = new Map<string, string>();
  const treeEdges: FlowchartEdge[] = [];
  const overflowEdges: FlowchartEdge[] = [];

  for (const edge of validEdges) {
    if (!primaryParentByNode.has(edge.to)) {
      primaryParentByNode.set(edge.to, edge.from);
      treeEdges.push(edge);
    } else {
      overflowEdges.push(edge);
    }
  }

  const childrenByParent = new Map<string, FlowchartEdge[]>();
  for (const edge of treeEdges) {
    const children = childrenByParent.get(edge.from) || [];
    children.push(edge);
    childrenByParent.set(edge.from, children);
  }

  const roots = nodes.filter((node) => (incoming.get(node.id) || 0) === 0).map((node) => node.id);

  if (roots.length === 0) {
    roots.push(nodes[0].id);
  }

  const visitedFromRoots = new Set<string>();
  const visit = (nodeId: string) => {
    if (visitedFromRoots.has(nodeId)) {
      return;
    }

    visitedFromRoots.add(nodeId);
    const children = childrenByParent.get(nodeId) || [];
    for (const child of children) {
      visit(child.to);
    }
  };

  for (const rootId of roots) {
    visit(rootId);
  }

  for (const node of nodes) {
    if (!visitedFromRoots.has(node.id)) {
      roots.push(node.id);
      visit(node.id);
    }
  }

  const renderNode = (nodeId: string, lineage: Set<string>, edgeLabel?: string) => {
    const node = nodeMap.get(nodeId);
    if (!node) {
      return null;
    }

    const isCycle = lineage.has(nodeId);
    const nextLineage = new Set(lineage);
    nextLineage.add(nodeId);

    const children = isCycle ? [] : childrenByParent.get(nodeId) || [];
    const isResult = node.type === "result";

    return (
      <li key={node.id} className="flowchart-item">
        {edgeLabel ? <span className="flowchart-edge-label">{edgeLabel}</span> : null}
        <article
          className={`flowchart-card ${
            isResult ? "flowchart-card-result" : "flowchart-card-question"
          }`}
        >
          <p className="flowchart-kind">{isResult ? "result" : "question"}</p>
          <p className="flowchart-text">{node.text}</p>
          {isResult && node.url ? (
            <a className="flowchart-link" href={node.url}>
              Read more <span aria-hidden="true">-&gt;</span>
            </a>
          ) : null}
        </article>

        {children.length > 0 ? (
          <ul className="flowchart-children">
            {children.map((edge) => renderNode(edge.to, nextLineage, edge.label))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <section className="my-10 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-6">
      {title ? <h3 className="m-0 text-lg font-semibold text-slate-900">{title}</h3> : null}
      <div className="mt-6 overflow-x-auto pb-4">
        <ul className="flowchart-root">
          {roots.map((rootId) => renderNode(rootId, new Set<string>()))}
        </ul>
      </div>

      {overflowEdges.length > 0 ? (
        <ul className="mt-6 space-y-2 border-t border-slate-200 pt-4">
          {overflowEdges.map((edge, index) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) {
              return null;
            }

            return (
              <li
                key={`${edge.from}-${edge.to}-${edge.label}-${index}`}
                className="flex flex-wrap items-center gap-2 text-sm text-slate-700"
              >
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
                  {from.text}
                </span>
                <span className="text-slate-500">- {edge.label} -&gt;</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
                  {to.text}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <style>{`
        .flowchart-root,
        .flowchart-root ul {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .flowchart-root {
          min-width: max-content;
          padding: 0.5rem 0;
        }

        .flowchart-item {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.25rem 0.625rem 0;
        }

        .flowchart-item::before,
        .flowchart-item::after {
          content: "";
          position: absolute;
          top: 0;
          width: 50%;
          border-top: 2px solid rgb(203 213 225);
        }

        .flowchart-item::before {
          right: 50%;
        }

        .flowchart-item::after {
          left: 50%;
          border-left: 2px solid rgb(203 213 225);
          height: 1.25rem;
        }

        .flowchart-item:only-child::before,
        .flowchart-item:only-child::after {
          display: none;
        }

        .flowchart-item:first-child::before,
        .flowchart-item:last-child::after {
          border: 0;
        }

        .flowchart-root > .flowchart-item::before,
        .flowchart-root > .flowchart-item::after {
          display: none;
        }

        .flowchart-children {
          position: relative;
          margin-top: 1rem;
          padding-top: 1.25rem;
          gap: 0.5rem;
        }

        .flowchart-children::before {
          content: "";
          position: absolute;
          top: 0;
          left: 50%;
          width: 0;
          height: 1.25rem;
          border-left: 2px solid rgb(203 213 225);
        }

        .flowchart-card {
          width: 15rem;
          border-radius: 0.8rem;
          border: 1px solid;
          padding: 0.85rem 1rem;
          background: white;
          box-shadow: 0 4px 14px -10px rgb(15 23 42 / 0.4);
        }

        .flowchart-card-question {
          border-color: rgb(191 219 254);
          background: rgb(239 246 255);
        }

        .flowchart-card-result {
          border-color: rgb(167 243 208);
          background: rgb(236 253 245);
        }

        .flowchart-kind {
          margin: 0;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgb(71 85 105);
        }

        .flowchart-text {
          margin: 0.45rem 0 0;
          font-size: 0.9rem;
          font-weight: 600;
          line-height: 1.45;
          color: rgb(15 23 42);
        }

        .flowchart-link {
          margin-top: 0.6rem;
          display: inline-flex;
          align-items: center;
          gap: 0.2rem;
          font-size: 0.82rem;
          font-weight: 600;
          color: rgb(6 95 70);
          text-decoration: none;
        }

        .flowchart-link:hover {
          color: rgb(4 120 87);
        }

        .flowchart-edge-label {
          margin-bottom: 0.35rem;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 0.18rem 0.55rem;
          font-size: 0.7rem;
          font-weight: 600;
          color: rgb(71 85 105);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
      `}</style>
    </section>
  );
}
