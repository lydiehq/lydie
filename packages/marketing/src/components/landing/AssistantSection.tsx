import { Container } from "../Container"

export function AssistantSection() {
  return (
    <section className="pt-px z-0 relative mb-32">
      <Container className="relative flex flex-col gap-y-4">
        <div className="flex justify-between items-end w-full">
          <h2 className="text-4xl font-heading font-medium tracking-tight text-gray-800 w-1/2">
            Assistant that keeps
            <br /> you organized.
          </h2>
          <span className="text-[15px]/relaxed text-gray-600 w-[30ch]"></span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GridContainer />
          <GridContainer />
        </div>
      </Container>
    </section>
  )
}

function GridContainer() {
  return <div className="rounded-[10px] ring ring-black/8 p-4"></div>
}
