import { ComponentGallery } from "./ComponentGallery";
import { EditorDemo } from "./EditorDemo";

// Checks the ported design system and editor against v1. Development only, at /playground.
export default function Playground() {
  return (
    <main className="min-h-screen bg-gray-100 px-10 py-10 text-gray-900">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10">
        <EditorDemo />
        <div id="components" className="rounded-xl bg-surface px-10 py-8 shadow-container">
          <ComponentGallery />
        </div>
      </div>
    </main>
  );
}
