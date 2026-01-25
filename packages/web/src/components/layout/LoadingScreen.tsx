import { Logo } from "@/components/layout/Logo";

export function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="flex flex-col gap-y-2 items-center animate-in fade-in blur-in duration-500">
        <Logo className="size-8 text-gray-300" />
      </div>
    </div>
  );
}
