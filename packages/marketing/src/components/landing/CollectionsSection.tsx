export function CollectionsSection() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-8">
        {[...Array(3)].map(() => (
          <div className="w-full h-[500px] rounded-xl ring ring-black/8"></div>
        ))}
      </div>
    </div>
  );
}
