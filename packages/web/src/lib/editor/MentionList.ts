/**
 * MentionList - Reusable mention suggestion list for TipTap editors
 * Used for @ mentions in chat inputs
 */
export class MentionList {
  items: any[]
  command: any
  element: HTMLElement
  selectedIndex: number

  constructor({ items, command }: { items: any[]; command: any }) {
    this.items = items
    this.command = command
    this.selectedIndex = 0

    this.element = document.createElement("div")
    this.element.className =
      "bg-white border border-gray-200 rounded-lg shadow-lg p-1 max-h-60 overflow-y-auto z-50"
    this.render()
  }

  render() {
    this.element.innerHTML = ""

    this.items.forEach((item, index) => {
      const itemElement = document.createElement("div")
      itemElement.className = `px-3 py-2 cursor-pointer rounded text-sm ${
        index === this.selectedIndex ? "bg-blue-100 text-blue-800" : "text-gray-700 hover:bg-gray-100"
      }`
      itemElement.textContent = item.label
      itemElement.addEventListener("click", () => {
        this.command(item)
      })
      this.element.appendChild(itemElement)
    })
  }

  updateProps(props: any) {
    this.items = props.items
    this.selectedIndex = 0
    this.render()
  }

  onKeyDown({ event }: { event: KeyboardEvent }) {
    if (event.key === "ArrowUp") {
      this.selectedIndex = (this.selectedIndex + this.items.length - 1) % this.items.length
      this.render()
      return true
    }

    if (event.key === "ArrowDown") {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length
      this.render()
      return true
    }

    if (event.key === "Enter") {
      this.command(this.items[this.selectedIndex])
      return true
    }

    return false
  }

  destroy() {
    this.element.remove()
  }
}
