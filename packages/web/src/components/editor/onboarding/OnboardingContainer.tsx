interface OnboardingContainerProps {
  title: React.ReactNode;
  progressText: string;
  children: React.ReactNode;
}

export function OnboardingContainer({ title, progressText, children }: OnboardingContainerProps) {
  return (
    <div className="p-1 bg-gray-100 rounded-[10px] relative editor-content-reset">
      <div className="p-1">
        <div className="text-[11px] text-gray-700 flex items-center gap-1.5">
          {title}
          <span className="text-gray-500">{progressText}</span>
        </div>
      </div>
      <div className="relative">
        <div className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden absolute h-full left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[calc(100%-1rem)] opacity-80 -rotate-2" />
        <div className="bg-white rounded-lg shadow-surface p-0.5 overflow-hidden relative">
          {children}
        </div>
      </div>
    </div>
  );
}
