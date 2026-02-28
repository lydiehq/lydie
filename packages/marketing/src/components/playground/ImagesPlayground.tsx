import { GeometricPatternIllustration } from "../illustrations/GeometricPatternIllustration";

type ImagesPlaygroundProps = {
  seed?: number | string;
};

export function ImagesPlayground({ seed }: ImagesPlaygroundProps) {
  return (
    <div className="w-full max-w-[65ch]">
      <GeometricPatternIllustration seed={seed} radius="md" />
    </div>
  );
}
