export interface TextDeserializeOptions {}

export function deserializeFromText(text: string, options: TextDeserializeOptions = {}): any {
  const lines = text.split("\n");
  const content: any[] = [];
  let currentParagraph: any = null;

  const closeParagraph = () => {
    if (currentParagraph) {
      if (currentParagraph.content.length > 0) {
        content.push(currentParagraph);
      }
      currentParagraph = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line?.trim() === "") {
      closeParagraph();
      continue;
    }

    if (!currentParagraph) {
      currentParagraph = {
        type: "paragraph",
        content: [],
      };
    }

    if (currentParagraph.content.length > 0) {
      currentParagraph.content.push({ type: "text", text: " " });
    }
    currentParagraph.content.push({ type: "text", text: line });
  }

  closeParagraph();

  if (content.length === 0) {
    content.push({
      type: "paragraph",
      content: [],
    });
  }

  return {
    type: "doc",
    content,
  };
}
