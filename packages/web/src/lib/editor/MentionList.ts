export class MentionList {
  items: any[]
  command: any
  element: HTMLElement
  listContainer: HTMLElement
  selectedIndex: number

  constructor({ items, command }: { items: any[]; command: any }) {
    this.items = items
    this.command = command
    this.selectedIndex = 0

    this.element = document.createElement("div")
    this.element.className =
      "bg-white shadow-2xl rounded-lg bg-clip-padding border border-black/10 text-slate-700 z-50"

    const listContainer = document.createElement("div")
    listContainer.className = "outline-none max-h-60 overflow-auto p-1 bg-white"
    this.element.appendChild(listContainer)
    this.listContainer = listContainer
    this.render()
  }

  selectItem(item: any) {
    if (item) {
      this.command(item)
    }
  }

  render() {
    this.listContainer.innerHTML = ""

    this.items.forEach((item, index) => {
      const itemElement = document.createElement("div")
      const isSelected = index === this.selectedIndex
      itemElement.className = `group flex items-center gap-4 cursor-default select-none py-1 pl-2 pr-1 rounded-md outline-none text-sm forced-color-adjust-none ${
        isSelected ? "bg-gray-100" : "text-gray-900 hover:bg-gray-100"
      }`

      const textSpan = document.createElement("span")
      textSpan.className = "flex items-center flex-1 truncate text-sm font-normal text-gray-800"
      textSpan.textContent = item.label
      itemElement.appendChild(textSpan)

      itemElement.addEventListener("click", () => {
        this.selectItem(item)
      })
      this.listContainer.appendChild(itemElement)
    })
  }

  updateProps(props: any) {
    this.items = props.items
    this.command = props.command
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
      this.selectItem(this.items[this.selectedIndex])
      return true
    }

    return false
  }

  destroy() {
    this.element.remove()
  }
}
