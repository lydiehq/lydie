import { cva } from "cva";

const styles = cva({
  base: "text-black/85 text-balance",
  variants: {
    level: {
      1: "tracking-tight font-medium text-3xl",
      2: "tracking-tight font-medium text-3xl",
      3: "text-lg font-semibold",
      4: "text-base font-semibold",
    },
  },
});

type Props = {
  level?: 1 | 2 | 3 | 4;
  className?: string;
  [key: string]: any;
};

export function Heading({ level = 1, className, ...rest }: Props) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
  return <Tag className={styles({ level, className })} {...rest} />;
}
