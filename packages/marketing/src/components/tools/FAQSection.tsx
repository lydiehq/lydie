import { FAQ } from "../generic/FAQ"

interface Props {
  faqs?: Array<{ q: string; a: string }>
}

export function FAQSection({ faqs }: Props) {
  if (!faqs || faqs.length === 0) {
    return null
  }

  const items = faqs.map((faq) => ({
    question: faq.q,
    answer: faq.a,
  }))

  return <FAQ items={items} />
}
