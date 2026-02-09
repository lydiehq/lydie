import { CastShadow } from "../../generic/CastShadow";
import { GradientOutline } from "../../generic/GradientOutline";

export function FeatureSpotSearch() {
  return (
    <CastShadow className="w-full">
      <GradientOutline />
      <div className="h-[380px] rounded-xl shadow-legit overflow-hidden bg-white flex items-center justify-center">
        <div className="rounded-md shadow-inner border border-black/8 bg-gray-50 w-80 h-8 flex items-center px-2">
          <span className="text-sm text-gray-500">Searching something...</span>
        </div>
      </div>
    </CastShadow>
  );
}
