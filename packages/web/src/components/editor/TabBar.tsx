import { Input } from "react-aria-components";

type TabBarProps = {
  title: string;
  onTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTitleFocus: () => void;
  onTitleBlur: () => void;
  onTitleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

export function TabBar({
  title,
  onTitleChange,
  onTitleFocus,
  onTitleBlur,
  onTitleKeyDown,
}: TabBarProps) {
  return (
    <div className="h-10 shrink-0 flex items-center">
      <div className="inline-flex max-w-[40ch]">
        <Input
          type="text"
          value={title}
          onChange={onTitleChange}
          onFocus={onTitleFocus}
          onBlur={onTitleBlur}
          onKeyDown={onTitleKeyDown}
          size={title.length || 1}
          className="font-medium text-gray-950 border-none outline-none focus:ring-0 w-auto max-w-full truncate"
          style={{
            width: `${Math.max(Math.min(title.length || 20, 34), 20)}ch`,
          }}
        />
      </div>
      <div className="flex-1">
        <ul className="flex items-center gap-1">
          {[...Array(3)].map((_, index) => (
            <li key={index}>
              <button className="text-sm font-medium text-gray-700 rounded-lg px-2 py-1">
                Yooooooooo
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
