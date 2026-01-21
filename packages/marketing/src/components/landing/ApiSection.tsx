import { Container } from "../Container"
import { ChevronRight, Code, BookOpen, Zap } from "lucide-react"
import { Eyebrow } from "./Eyebrow"
import { AsciiBackground } from "./AsciiBackground"
import { Button } from "../generic/Button"

const points = [
  {
    title: "Ready-to-deploy examples",
    description:
      "Get started quickly with pre-built blog templates for Next.js and other popular frameworks.",
    icon: BookOpen,
  },
  {
    title: "REST API",
    description: "Low-level API access for complete control. Simple HTTP endpoints with full type safety.",
    icon: Code,
  },
  {
    title: "TypeScript SDK",
    description:
      "Official SDK with React hooks, HTML rendering, and full TypeScript support for advanced integrations.",
    icon: Zap,
  },
]

export function ApiSection() {
  return (
    <section className="pt-px z-0 relative mb-32">
      <Container className="relative flex flex-col gap-y-4">
        <div className="flex justify-between items-end w-full">
          <h2 className="text-4xl font-heading font-medium tracking-tight text-gray-800 w-1/2">
            Easily setup a blog.
          </h2>
          <span className="text-[15px]/relaxed text-gray-600 w-[30ch]">
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Ipsa, obcaecati!
          </span>
        </div>
        <div className="rounded-xl ring ring-black/8 p-4 relative h-[600px]"></div>
      </Container>
    </section>
  )

  return (
    <section className="pt-px z-0 relative -mb-40">
      <Container className="relative flex flex-col items-start py-4 md:flex-row md:py-0">
        <AsciiBackground className="right-[200px] inset-y-6" startPercentage={75} />
        <div className="relative flex flex-col gap-y-4 md:flex-row">
          <div className="-mr-[500px] relative">
            <div className="w-[700px] md:h-[600px] z-10 relative md:w-[980px] p-2 bg-white ring ring-black/4 rounded-2xl">
              <div className="rounded-[10px] ring ring-black/8 shadow-legit bg-gray-900 p-6 h-full overflow-hidden">
                <div className="flex flex-col gap-y-4 h-full">
                  <div className="flex items-center gap-x-2">
                    <Code className="size-4 text-gray-400" />
                    <span className="text-xs font-medium text-gray-400">REST API</span>
                  </div>
                  <pre className="text-xs text-gray-300 font-mono overflow-x-auto">
                    <code>{`GET /v1/:orgId/documents/:slug

curl https://api.lydie.co/v1/your-org/documents/getting-started \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</code>
                  </pre>
                  <div className="flex items-center gap-x-2 mt-4 pt-4 border-t border-gray-800">
                    <Code className="size-4 text-gray-400" />
                    <span className="text-xs font-medium text-gray-400">TypeScript SDK</span>
                  </div>
                  <pre className="text-xs text-gray-300 font-mono overflow-x-auto flex-1">
                    <code>{`import { LydieClient } from "@lydie/sdk/client";

const client = new LydieClient({
  apiKey: process.env.LYDIE_API_KEY,
  organizationId: "your-org",
});

const doc = await client.getDocument("getting-started");`}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col w-[46ch] gap-4 mr-4 mt-20 relative z-10 pr-20 py-2 rounded-3xl">
            <Eyebrow>Blog Setup</Eyebrow>
            <h2 className="text-4xl font-heading font-medium tracking-tight text-gray-800">
              Easily set up <br /> a blog.
            </h2>
            <span className="text-[15px]/relaxed text-gray-600 text-balance">
              Deploy a blog in minutes with our ready-to-use examples, or use our low-level REST API and
              TypeScript SDK for complete control over your integration.
            </span>
            <div className="flex items-center gap-x-3">
              <Button href="https://app.lydie.co/auth" size="lg" className="self-start">
                <div className="flex items-center gap-x-1">
                  <span>Get started</span>
                  <ChevronRight className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
                </div>
              </Button>
              <Button href="/documentation/examples" intent="secondary" size="lg" className="self-start">
                <div className="flex items-center gap-x-1">
                  <span>View examples</span>
                  <ChevronRight className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
                </div>
              </Button>
            </div>
            <hr className="border-gray-100 w-full my-4" />
            <div className="grid grid-cols-1 gap-8">
              {points.map((point, i) => (
                <div className="flex flex-col gap-y-4 shrink-0" key={i}>
                  <div className="flex items-center gap-x-2">
                    <point.icon className="size-4 text-gray-700" />
                    <h3 className="font-medium text-[15px]/0 text-gray-900">{point.title}</h3>
                  </div>
                  <p className="text-[0.8125rem]/relaxed text-gray-600">{point.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
