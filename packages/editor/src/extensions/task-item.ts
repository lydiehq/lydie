import { TaskItem as BaseTaskItem } from "@tiptap/extension-list";

const SVG = "http://www.w3.org/2000/svg";

// @lydie/ui's CheckboxMark (the box and its checkmark, the same path and classes), as plain DOM:
// this package cannot import @lydie/ui. editor-content.css draws it from the input's :checked.
function checkboxMark() {
  const mark = document.createElement("span");
  mark.dataset.checkboxMark = "";
  mark.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 18 18");
  svg.setAttribute("class", "checkbox-checkmark");
  const check = document.createElementNS(SVG, "polyline");
  check.setAttribute("points", "2 9 7 14 16 4");
  svg.append(check);
  mark.append(svg);
  return mark;
}

// TipTap's task item with the app's checkbox look. Its own input stays, invisible, for the
// behaviour, the keyboard and screen readers; the mark beside it is what shows.
export const TaskItem = BaseTaskItem.extend({
  addNodeView() {
    const base = this.parent?.();
    if (!base) return null;
    return (props) => {
      const view = base(props);
      const input =
        view.dom instanceof HTMLElement
          ? view.dom.querySelector(':scope > label > input[type="checkbox"]')
          : null;
      input?.after(checkboxMark());
      return view;
    };
  },
});
