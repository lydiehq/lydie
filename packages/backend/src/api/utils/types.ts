// Types for document content structure (TipTap JSON format)

export interface Mark {
  type: string;
  attrs?: {
    href?: string;
    rel?: string;
    target?: string;
    class?: string | null;
    [key: string]: any;
  };
}

export interface TextNode {
  type: "text";
  text: string;
  marks?: Mark[];
}

export interface ContentNode {
  type: string;
  attrs?: {
    level?: number;
    start?: number;
    tight?: boolean;
    name?: string;
    properties?: Record<string, any>;
    [key: string]: any;
  };
  content?: (ContentNode | TextNode)[];
}
