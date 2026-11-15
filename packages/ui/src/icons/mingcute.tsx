// MingCute icons (Apache-2.0, MingCute Design: https://www.mingcute.com; licence in
// ./MINGCUTE-LICENSE), vendored as plain SVG so the package does not pull in @mingcute/react and its
// 50 MB of definitions. MingCute's default ("core-regular") icons; names match @mingcute/react
// (`Search2Regular`, `Settings3Regular`, `...Filled` for "core-filled"). To add one, copy its
// `elements` from @mingcute/icons (dist/styles/core-regular/<name>.js), attribute names camelCased.
import { createElement } from "react";
import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;
export type Icon = (props: IconProps) => React.JSX.Element;
type IconElement = readonly [tag: "path" | "circle", attributes: Record<string, string>];

function createIcon(name: string, elements: readonly IconElement[]): Icon {
  function MingcuteIcon(props: IconProps) {
    return (
      <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden focusable="false" {...props}>
        {elements.map(([tag, attributes], i) => createElement(tag, { key: i, ...attributes }))}
      </svg>
    );
  }
  MingcuteIcon.displayName = name;
  return MingcuteIcon;
}

export const AddRegular = createIcon("AddRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M5 12h14m-7 7V5",
    },
  ],
]);
export const AddSquareRegular = createIcon("AddSquareRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M8 12h8m-4 4V8M5 20h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z",
    },
  ],
]);
export const AlertRegular = createIcon("AlertRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M12 9v4m0 3h.002m-8.636 3.353h17.268a.5.5 0 0 0 .433-.75L12.433 3.648a.5.5 0 0 0-.866 0L2.933 18.603a.5.5 0 0 0 .433.75",
    },
  ],
]);
export const AlertOctagonRegular = createIcon("AlertOctagonRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M12 7v6m0 3h.002M3.5 9.308v5.384a2 2 0 0 0 .586 1.415l3.807 3.807a2 2 0 0 0 1.415.586h5.384a2 2 0 0 0 1.415-.586l3.807-3.807a2 2 0 0 0 .586-1.415V9.308a2 2 0 0 0-.586-1.415l-3.807-3.807a2 2 0 0 0-1.415-.586H9.308a2 2 0 0 0-1.415.586L4.086 7.893A2 2 0 0 0 3.5 9.308Z",
    },
  ],
]);
export const AlignCenterRegular = createIcon("AlignCenterRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M4 4h16M7 9h10M4 14h16M7 19h10",
    },
  ],
]);
export const ArrowLeftRegular = createIcon("ArrowLeftRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M5 12h15m-10 5.657L4.343 12 10 6.343",
    },
  ],
]);
export const ArrowRightRegular = createIcon("ArrowRightRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M4 12h15m-5 5.657L19.657 12 14 6.343",
    },
  ],
]);
export const ArrowUpRegular = createIcon("ArrowUpRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M12 20V5m-5.657 5L12 4.343 17.657 10",
    },
  ],
]);
export const Back2Regular = createIcon("Back2Regular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M20 15.5a1 1 0 1 0 2 0zM3.418 12.706a1 1 0 1 0 1.911.588L4.373 13zm7.035.237a1 1 0 1 0-.348-1.97l.174.985zM4.37 13l-.985.174a1 1 0 0 0 1.159.81zm-.057-6.082a1 1 0 1 0-1.97.347l.985-.174zM12.5 7v1a7.5 7.5 0 0 1 7.5 7.5h2A9.5 9.5 0 0 0 12.5 6zm-8.127 6 .956.294A7.5 7.5 0 0 1 12.5 8V6a9.5 9.5 0 0 0-9.081 6.706zm5.906-1.042-.174-.985-5.909 1.042.174.985.174.985 5.909-1.042zM4.37 13l.985-.174-1.042-5.908-.985.173-.985.174 1.042 5.909z",
    },
  ],
]);
export const BoldRegular = createIcon("BoldRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M6 12h7a4 4 0 0 0 0-8H6zm0 0h8a4 4 0 0 1 0 8H6z",
    },
  ],
]);
export const BracesRegular = createIcon("BracesRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M8 4H7a2 2 0 0 0-2 2v3.99a2 2 0 0 1-2 2M3 12c1.1.005 2 .9 2 2v4a2 2 0 0 0 2 2h1m8 0h1a2 2 0 0 0 2-2v-4c0-1.1.9-1.995 2-2m-5-8h1a2 2 0 0 1 2 2v3.99a2 2 0 0 0 2 2",
    },
  ],
]);
export const BrightnessRegular = createIcon("BrightnessRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M12 17a5 5 0 0 0 0-10m0 10a5 5 0 0 1 0-10m0 10V7m0-3V3m5.657 3.343.707-.707M20 12h1m-3.343 5.657.707.707M12 20v1m-5.657-3.343-.707.707M4 12H3m3.343-5.657-.707-.707",
    },
  ],
]);
export const BulbRegular = createIcon("BulbRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M11 21h2m0-14-2 2 2 2-2 2M5 9.933c0 3.986 3.047 6.398 3.822 6.947.116.082.219.181.297.3L10 18.5h4l.88-1.32q.122-.178.298-.3C15.953 16.33 19 13.92 19 9.933 19 6.104 15.866 3 12 3S5 6.104 5 9.933",
    },
  ],
]);
export const CalendarRegular = createIcon("CalendarRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M17 4a1 1 0 1 0-2 0zm-2 2a1 1 0 1 0 2 0zM9 4a1 1 0 0 0-2 0zM7 6a1 1 0 0 0 2 0zM5 6v1h14V5H5zm15 1h-1v12h2V7zm-1 13v-1H5v2h14zM4 19h1V7H3v12zm0-8v1h16v-2H4zm12-7h-1v2h2V4zM8 4H7v2h2V4zM5 20v-1H3a2 2 0 0 0 2 2zm15-1h-1v2a2 2 0 0 0 2-2zM19 6v1h2a2 2 0 0 0-2-2zM5 6V5a2 2 0 0 0-2 2h2z",
    },
  ],
]);
export const CalendarDayRegular = createIcon("CalendarDayRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M8 8h8m-8 4h8v4H8zm-3 8h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1",
    },
  ],
]);
export const Chat3Regular = createIcon("Chat3Regular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M10.094 19.841c-.775.613-1.605 1.051-2.609 1.136-.521.044-1.056.033-1.35-.476-.262-.451-.052-1.468-.166-2.031l-.069-.228-.022-.02-.513-.359-.583-.476c-1.124-.985-2.028-2.289-2.456-3.728a7.5 7.5 0 0 1-.036-4.2c1.008-3.589 4.55-5.841 8.082-6.347a11.54 11.54 0 0 1 5.496.546c3.872 1.397 6.776 4.926 6.004 9.203-.249 1.376-.925 2.645-1.832 3.698-2.417 2.806-6.376 3.842-9.946 3.282m-2.08-1.026c.579-.265 1.075-.873 1.693-.984.354-.063.726.05 1.069.093l.605.056c1.483.093 2.992-.145 4.358-.736 3.032-1.309 5.196-4.426 3.872-7.744-.395-.991-1.071-1.854-1.888-2.535-3.527-2.94-9.753-2.604-12.572 1.182-.834 1.12-1.265 2.505-1.121 3.902.153 1.49.95 2.832 2.055 3.82.343.307.728.53 1.081.822.645.533.795 1.332.848 2.124",
    },
  ],
]);
export const StickerRegular = createIcon("StickerRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M21 13.211a3.1 3.1 0 0 1-.851 2.054l-4.884 4.884a3.1 3.1 0 0 1-2.054.851H5.96c-.788-.032-1.52-.314-2.083-.877S3.032 18.828 3 18.04V5.96a3.1 3.1 0 0 1 .332-1.34C3.849 3.623 4.854 3.045 5.96 3h12.08c1.67.067 2.893 1.29 2.96 2.96ZM19 12V6.04c-.025-.622-.418-1.015-1.04-1.04H6.04c-.336.014-.641.132-.845.412-.138.188-.186.398-.195.628v11.92c.016.389.184.741.542.926.159.082.321.107.498.114H12v-4.04c.067-1.67 1.29-2.893 2.96-2.96Zm-5 6.586L18.586 14H15.04c-.622.025-1.015.418-1.04 1.04Z",
    },
  ],
]);
export const CheckRegular = createIcon("CheckRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "m3.514 11.83 5.657 5.656L20.485 6.172",
    },
  ],
]);
export const CheckCircleRegular = createIcon("CheckCircleRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M8.464 11.21a1 1 0 0 0-1.414 1.414l.707-.707zm2.122 3.535-.707.707a1 1 0 0 0 1.414 0zm6.364-4.95a1 1 0 0 0-1.415-1.414l.707.707zM21 12h-1a8 8 0 0 1-8 8v2c5.523 0 10-4.477 10-10zm-9 9v-1a8 8 0 0 1-8-8H2c0 5.523 4.477 10 10 10zm-9-9h1a8 8 0 0 1 8-8V2C6.477 2 2 6.477 2 12zm9-9v1a8 8 0 0 1 8 8h2c0-5.523-4.477-10-10-10zm-4.243 8.917-.707.707 2.829 2.828.707-.707.707-.707-2.829-2.828zm2.829 2.828.707.707 5.657-5.657-.707-.707-.708-.707-5.656 5.657z",
    },
  ],
]);
export const CloseRegular = createIcon("CloseRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "m5.636 5.637 12.728 12.728m-12.728 0L18.364 5.637",
    },
  ],
]);
export const CodeRegular = createIcon("CodeRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M14.216 4.106 9.784 19.894M6.5 7.757 2.257 12 6.5 16.243m11-8.486L21.743 12 17.5 16.243",
    },
  ],
]);
export const Columns2Regular = createIcon("Columns2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M12 4v16m-7 0h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z",
    },
  ],
]);
export const Copy2Regular = createIcon("Copy2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M8 6V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-2M4 21h11a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1Z",
    },
  ],
]);
export const DeleteRegular = createIcon("DeleteRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M10 3h4M4 6h16m-1.929 0-1.005 14.071a1 1 0 0 1-.997.929H7.93a1 1 0 0 1-.997-.929L5.929 6",
    },
  ],
]);
export const Delete2Regular = createIcon("Delete2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "m5 6 .876 13.133A2 2 0 0 0 7.87 21h8.258a2 2 0 0 0 1.995-1.867L19 6M8 6l.772-2.316A1 1 0 0 1 9.721 3h4.558a1 1 0 0 1 .949.684L16 6m-6 5v5m4-5v5M4 6h16",
    },
  ],
]);
export const DocumentsRegular = createIcon("DocumentsRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M16 17v3a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3m6-4v4.5a.5.5 0 0 0 .5.5H20m-4.414-5H10a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V7.414a1 1 0 0 0-.293-.707l-3.414-3.414A1 1 0 0 0 15.586 3Z",
    },
  ],
]);
export const DotsVerticalRegular = createIcon("DotsVerticalRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M6 14.5a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1m6 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1m6 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1m-12-6a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1m6 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1m6 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1",
    },
  ],
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M6 14.5a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1Zm6 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1Zm6 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1Zm-12-6a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1Zm6 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1Zm6 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1Z",
    },
  ],
]);
export const DownRegular = createIcon("DownRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M17.657 9.343 12 15 6.343 9.343",
    },
  ],
]);
export const Edit2Regular = createIcon("Edit2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "m12.17 6.17-7.88 7.881a1 1 0 0 0-.294.707v5.243H9.24a1 1 0 0 0 .707-.293l7.88-7.88M12.17 6.17l2.433-2.433a1 1 0 0 1 1.414 0L20.26 7.98a1 1 0 0 1 0 1.414l-2.433 2.433M12.17 6.17l5.657 5.657",
    },
  ],
]);
export const EmojiRegular = createIcon("EmojiRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M9 9.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m7 0a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0",
    },
  ],
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M8.5 14.57A4.98 4.98 0 0 0 12 16a4.98 4.98 0 0 0 3.5-1.43M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 9.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm7 0a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z",
    },
  ],
]);
export const ExitRegular = createIcon("ExitRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M12 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m0-8h7.5M17 9.172 19.828 12 17 14.828",
    },
  ],
]);
export const ExternalLinkRegular = createIcon("ExternalLinkRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M17 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h6m9 2V4h-5m-5 10 9.5-9.5",
    },
  ],
]);
export const FileRegular = createIcon("FileRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M13 3v5.5a.5.5 0 0 0 .5.5H19m-5.414-6H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.414a1 1 0 0 0-.293-.707l-4.414-4.414A1 1 0 0 0 13.586 3Z",
    },
  ],
]);
export const FileImportRegular = createIcon("FileImportRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M3 17a1 1 0 1 0 0 2zm6.328 2a1 1 0 1 0 0-2zm-1.62-4.536a1 1 0 1 0-1.415 1.415L7 15.172zM9.827 18l.708.707a1 1 0 0 0 0-1.414zm-3.535 2.121a1 1 0 1 0 1.414 1.415L7 20.828zm8-16.828L13.586 4zM19 8.414h-1V9h2v-.586zM19 9h-1v11h2V9zm-1 12v-1h-6v2h6zM6 3v1h7V2H6zm7 0v1h.586V2H13zm1.293.293L13.586 4 18 8.414l.707-.707.707-.707L15 2.586zM13 3h-1v5.5h2V3zm.5 6v1H19V8h-5.5zM5 12h1V4H4v8zm-2 6v1h6.328v-2H3zm4-2.828-.707.707 2.828 2.828.707-.707.708-.707-2.829-2.828zM9.828 18l-.707-.707-2.828 2.828.707.707.707.707 2.829-2.828zm3.758-15v1l.707-.707.707-.707A2 2 0 0 0 13.586 2zM6 3V2a2 2 0 0 0-2 2h2zm7 5.5h-1a1.5 1.5 0 0 0 1.5 1.5V8a.5.5 0 0 1 .5.5zM19 20h-1v2a2 2 0 0 0 2-2zm0-11.586h1A2 2 0 0 0 19.414 7l-.707.707-.707.707z",
    },
  ],
]);
export const FileNewRegular = createIcon("FileNewRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M13 3v5.5a.5.5 0 0 0 .5.5H19m-7 3.5v5M9.5 15h5m-.914-12H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.414a1 1 0 0 0-.293-.707l-4.414-4.414A1 1 0 0 0 13.586 3",
    },
  ],
]);
export const FileSearchRegular = createIcon("FileSearchRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M13 3v5.5a.5.5 0 0 0 .5.5H19m-5.5 7.5 1.207 1.207M14 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0m-.414-12H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.414a1 1 0 0 0-.293-.707l-4.414-4.414A1 1 0 0 0 13.586 3",
    },
  ],
]);
export const FlashRegular = createIcon("FlashRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M13.182 10 14 2 4 14h6.818L10 22l10-12z",
    },
  ],
]);
export const FormulaRegular = createIcon("FormulaRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M18 5V4H6v2l7 6-7 6v2h12v-1",
    },
  ],
]);
export const Forward2Regular = createIcon("Forward2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M3 15.5a8.5 8.5 0 0 1 16.456-3m-5.735-.542L19.63 13l1.042-5.909",
    },
  ],
]);
export const FullscreenRegular = createIcon("FullscreenRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M4 8V5a1 1 0 0 1 1-1h3M4 16v3a1 1 0 0 0 1 1h3M20 8V5a1 1 0 0 0-1-1h-3m4 12v3a1 1 0 0 1-1 1h-3",
    },
  ],
]);
export const GlobeRegular = createIcon("GlobeRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M12 18.001a9 9 0 0 0 6-15.708m-6 15.708a8.99 8.99 0 0 1-7.5-4.023m7.5 4.023v3m-4 0h8m2-12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
    },
  ],
]);
export const Heading1Regular = createIcon("Heading1Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M4 4v16m9-16v16m-9-8h9m3.5 2.5 1.5-1V20",
    },
  ],
]);
export const Heading2Regular = createIcon("Heading2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M4 4v16m9-16v16m-9-8h9m3.64 3.357v-.094a1.663 1.663 0 0 1 2.407-1.488l.036.018a1.77 1.77 0 0 1 .927 2.014l-.007.026c-.074.297-.223.57-.431.794l-2.93 3.138-.002.006v.22q0 .008.01.009h3.704",
    },
  ],
]);
export const Heading3Regular = createIcon("Heading3Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M4 4v16m9-16v16m3.714-5.49.094-.221A1.3 1.3 0 0 1 18 13.5h.371c.9 0 1.629.734 1.629 1.633a1.62 1.62 0 0 1-1.614 1.617m0 0h-.1m.1 0A1.615 1.615 0 0 1 20 18.367c0 .9-.73 1.633-1.628 1.633H18c-.52 0-.989-.31-1.192-.789l-.094-.221M4 12h9",
    },
  ],
]);
export const HistoryAnticlockwiseRegular = createIcon("HistoryAnticlockwiseRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "m4 11.97 1.607-.42a.1.1 0 0 1 .1.162L3.456 14.3a.098.098 0 0 1-.17-.04A9.003 9.003 0 0 1 19.794 7.5 9 9 0 0 1 5.92 18.64M12 7v5l3 3",
    },
  ],
]);
export const Home2Regular = createIcon("Home2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M3.003 10v-.002l8.383-6.52a1 1 0 0 1 1.228 0l8.384 6.52V10H19v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9z",
    },
  ],
]);
export const InboxRegular = createIcon("InboxRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M3.5 12h5a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 1 .5-.5h5m.236-.461-3.448-6.035A1 1 0 0 0 16.42 5H7.58a1 1 0 0 0-.868.504l-3.448 6.035A2 2 0 0 0 3 12.53V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5.469a2 2 0 0 0-.264-.992Z",
    },
  ],
]);
export const InformationRegular = createIcon("InformationRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M12 8h.002M11 11h1v6h.5m8.5-5a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    },
  ],
]);
export const QuestionRegular = createIcon("QuestionRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.29c-.6.26-1 .85-1 1.5V14m0 3h.002M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    },
  ],
]);
export const ItalicRegular = createIcon("ItalicRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M10 4h6m-3 0-2 16m-3 0h6",
    },
  ],
]);
export const KeyboardRegular = createIcon("KeyboardRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M7 9h1m3.5 0h1M16 9h1M7 12h1m3.5 0h1m3.5 0h1M7 15h10M4 19h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1",
    },
  ],
]);
export const LayoutLeftRegular = createIcon("LayoutLeftRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M9 4v16m-4 0h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z",
    },
  ],
]);
export const LayoutRightRegular = createIcon("LayoutRightRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M15 4v16M5 20h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z",
    },
  ],
]);
export const LayoutTopRegular = createIcon("LayoutTopRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M4 9h16M5 20h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z",
    },
  ],
]);
export const LeftRegular = createIcon("LeftRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M14.657 17.657 9 12l5.657-5.657",
    },
  ],
]);
export const LinkRegular = createIcon("LinkRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "m11.646 5.989-1.414-1.414a4 4 0 1 0-5.657 5.656l2.829 2.829a4 4 0 0 0 5.657 0m-.707 4.95 1.414 1.414a4 4 0 1 0 5.657-5.657l-2.829-2.828a4 4 0 0 0-5.657 0",
    },
  ],
]);
export const Link2Regular = createIcon("Link2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "m10.839 17.203 2.121 2.121a4.5 4.5 0 1 0 6.364-6.364l-2.121-2.121m-9.9 2.828-2.121-2.121a4.5 4.5 0 1 1 6.364-6.364l2.121 2.121m-3.535 2.829 4.242 4.242",
    },
  ],
]);
export const ListCheckRegular = createIcon("ListCheckRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M5 5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 7a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 7a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0",
    },
  ],
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M9 5h11M9 12h11M9 19h11M5 5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm0 7a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm0 7a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z",
    },
  ],
]);
export const ListCheck2Regular = createIcon("ListCheck2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M11 5h9m-9 7h9m-9 7h9M7.945 3.72 5.47 6.195 4.055 4.78m3.89 5.94L5.47 13.195 4.055 11.78m3.89 5.94L5.47 20.195 4.055 18.78",
    },
  ],
]);
export const ListExpansionRegular = createIcon("ListExpansionRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M20.837 5.607c.132-.258-.062-.556-.38-.584a29 29 0 0 0-2.454-.1c-1.106 0-1.983.058-2.516.105-.296.027-.461.299-.332.552.22.432.596 1.121 1.144 1.966.549.845 1.033 1.48 1.343 1.865.183.225.53.235.704.02.311-.385.806-1.03 1.361-1.884a22 22 0 0 0 1.13-1.94m0 9.999c.132-.257-.062-.556-.38-.583-.536-.046-1.39-.1-2.454-.1-1.106 0-1.983.057-2.516.105-.296.026-.461.298-.332.552.22.431.596 1.12 1.144 1.966a23 23 0 0 0 1.343 1.864c.183.226.53.236.704.02.311-.384.806-1.03 1.361-1.883a22 22 0 0 0 1.13-1.94",
    },
  ],
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M4 5h8m-8 7h8m-8 7h8",
    },
  ],
]);
export const ListOrderedRegular = createIcon("ListOrderedRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M9 5h11M9 12h11M9 19h11",
    },
  ],
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "1.3",
      d: "m4.75 3.88.742-.494a.005.005 0 0 1 .008.004v3.24m-.932 4.679v-.047a.832.832 0 0 1 1.204-.744l.018.009a.886.886 0 0 1 .463 1.007l-.003.013a.9.9 0 0 1-.216.397L4.57 13.513l-.002.003v.11q.001.004.005.004h1.853m-1.819 4.245.047-.11a.65.65 0 0 1 .596-.395h.186a.816.816 0 0 1 .495 1.461.8.8 0 0 1-.488.164m0 0h-.05m.05 0a.807.807 0 0 1 .807.809c0 .45-.365.816-.814.816H5.25a.65.65 0 0 1-.596-.394l-.047-.11",
    },
  ],
]);
export const Loading3Regular = createIcon("Loading3Regular", [
  [
    "circle",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      opacity: ".1",
      cx: "12",
      cy: "12",
      r: "9",
    },
  ],
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M12 3a8.96 8.96 0 0 0-6.225 2.5",
    },
  ],
]);
export const MarkPenRegular = createIcon("MarkPenRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "m8 20 .86-5.164A1 1 0 0 1 9.848 14h4.306a1 1 0 0 1 .986.836L16 20m-6-6v-4l4-2v6m7-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    },
  ],
]);
export const MinimizeRegular = createIcon("MinimizeRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M5 12h14",
    },
  ],
]);
export const MoonRegular = createIcon("MoonRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "m13.38 4.121-.91.412a1 1 0 0 1 1.082-1.397zM14 7h1zm-9.879 6.38-.985.171a1 1 0 0 1 1.397-1.082zM20 12h1zm-6.62-7.879.912-.412A8 8 0 0 1 15 7h-2c0-.88-.19-1.715-.53-2.467zM14 7h1a8 8 0 0 1-8 8v-2a6 6 0 0 0 6-6zm-7 7v1a8 8 0 0 1-3.29-.709l.411-.911.412-.911A6 6 0 0 0 7 13zm-2.879-.62.985-.171A7 7 0 0 0 12 19v2c-4.443 0-8.128-3.218-8.864-7.449zM12 20v-1a7 7 0 0 0 7-7h2a9 9 0 0 1-9 9zm8-8h-1a7 7 0 0 0-5.79-6.894l.17-.985.172-.985C17.782 3.872 21 7.558 21 12z",
    },
  ],
]);
export const More1Regular = createIcon("More1Regular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M12.5 12a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m6 0a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m-12 0a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0",
    },
  ],
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M12.5 12a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm6 0a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm-12 0a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z",
    },
  ],
]);
export const More2Regular = createIcon("More2Regular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M12 12.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m0 6a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m0-12a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1",
    },
  ],
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M12 12.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm0 6a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm0-12a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Z",
    },
  ],
]);
export const Notebook2Regular = createIcon("Notebook2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M5 4a1 1 0 0 1 1-1h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a1 1 0 0 1-1-1z",
    },
  ],
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M11 3h4v10l-2-2-2 2z",
    },
  ],
]);
export const Pencil2Regular = createIcon("Pencil2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M12 20h7M7.964 18.157l10.96-10.96a1.5 1.5 0 1 0-2.121-2.122l-10.96 10.96-1.767 3.887q0 0 0 0l.001.001h.001z",
    },
  ],
]);
export const PicRegular = createIcon("PicRegular", [
  ["path", { fill: "currentColor", d: "M16 8.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0" }],
  [
    "path",
    {
      fill: "currentColor",
      d: "M14.121 14.879a1 1 0 1 0 1.415 1.414l-.708-.707zm2.829-1.415.707-.707a1 1 0 0 0-1.414 0zm3.328 4.743a1 1 0 0 0 1.414-1.414l-.707.707zm-10.4-7.571.708-.707a1 1 0 0 0-1.415 0zm5.158 6.571a1 1 0 0 0 1.414-1.414l-.707.707zM4 4v1h16V3H4zm17 1h-1v14h2V5zm-1 15v-1H4v2h16zM3 19h1V5H2v14zm11.828-3.414.708.707 2.12-2.121-.706-.708-.707-.707-2.122 2.122zm2.122-2.122-.707.707 4.035 4.036.707-.707.707-.707-4.035-4.036zm-7.071-2.828-.707.707 5.864 5.864.707-.707.707-.707-5.864-5.864zM3 17.515l.707.707 6.879-6.879-.707-.707-.707-.707-6.88 6.879zM16 8.5h-1a.5.5 0 0 1 .5-.5v2A1.5 1.5 0 0 0 17 8.5zm-.5.5V8a.5.5 0 0 1 .5.5h-2a1.5 1.5 0 0 0 1.5 1.5zm-.5-.5h1a.5.5 0 0 1-.5.5V7A1.5 1.5 0 0 0 14 8.5zm.5-.5v1a.5.5 0 0 1-.5-.5h2A1.5 1.5 0 0 0 15.5 7zM4 20v-1H2a2 2 0 0 0 2 2zm17-1h-1v2a2 2 0 0 0 2-2zM20 4v1h2a2 2 0 0 0-2-2zM4 4V3a2 2 0 0 0-2 2h2z",
    },
  ],
]);
export const PinRegular = createIcon("PinRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M9.879 14.122c2.508 2.509 4.275 3.781 5.3 4.402.534.324 1.145-.02 1.233-.638l.175-1.227a10 10 0 0 1 1.9-4.586l2.185-2.914a1 1 0 0 0-.093-1.307l-4.43-4.43a1 1 0 0 0-1.307-.093l-2.914 2.185a10 10 0 0 1-4.586 1.9l-1.227.175c-.618.088-.962.7-.639 1.233.622 1.025 1.894 2.792 4.403 5.3Zm0 0-4.95 4.95",
    },
  ],
]);
export const QuoteLeftRegular = createIcon("QuoteLeftRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M5 14.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Zm0 0C4.833 13 5 10 9 7m5 7.5C13.833 13 14 10 18 7m-4 7.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z",
    },
  ],
]);
export const Refresh2Regular = createIcon("Refresh2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M3.811 8.264A9 9 0 0 1 14.33 3.307a9 9 0 0 1 6.672 8.622c0 .08-.088.126-.154.082l-2.678-1.804c-.091-.062-.03-.205.078-.181L20 10.41m.189 5.327c-1.789 3.932-6.208 6.112-10.519 4.956a9 9 0 0 1-6.672-8.622c0-.08.088-.126.154-.082l2.678 1.805c.091.061.03.204-.078.18L4 13.59",
    },
  ],
]);
export const RestoreRegular = createIcon("RestoreRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M8 8V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3M5 20h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1Z",
    },
  ],
]);
export const RightRegular = createIcon("RightRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M9.343 6.343 15 12l-5.657 5.657",
    },
  ],
]);
export const Rows2Regular = createIcon("Rows2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M4 12h16M5 20h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z",
    },
  ],
]);
export const Rows3Regular = createIcon("Rows3Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm0 10a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
    },
  ],
]);
export const Search2Regular = createIcon("Search2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M14.5 14.5 20 20m-4-10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
    },
  ],
]);
export const Settings3Regular = createIcon("Settings3Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M17.947 5.545a.51.51 0 0 0-.171-.447 9 9 0 0 0-2.684-1.551.51.51 0 0 0-.473.075c-.761.548-1.658.88-2.619.88-.96 0-1.858-.332-2.62-.88a.51.51 0 0 0-.473-.075 9 9 0 0 0-2.683 1.552.51.51 0 0 0-.171.446c.093.933-.068 1.875-.548 2.706-.48.832-1.215 1.443-2.07 1.828a.51.51 0 0 0-.302.373 9 9 0 0 0 0 3.098.51.51 0 0 0 .301.373c.856.386 1.59.997 2.07 1.828s.642 1.773.549 2.706a.51.51 0 0 0 .171.447 9 9 0 0 0 2.683 1.552c.16.058.336.024.474-.075.761-.549 1.659-.88 2.619-.88s1.858.331 2.62.88a.51.51 0 0 0 .473.075 9 9 0 0 0 2.683-1.552.51.51 0 0 0 .171-.447c-.093-.933.068-1.875.548-2.706s1.215-1.442 2.07-1.828a.51.51 0 0 0 .302-.373 9 9 0 0 0 0-3.098.51.51 0 0 0-.301-.373c-.856-.385-1.59-.996-2.07-1.828-.48-.83-.642-1.773-.549-2.706Z",
    },
  ],
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    },
  ],
]);
export const Share2Regular = createIcon("Share2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "m16.407 6.81-6 3.145m0 4.089 6 3.145M11 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm10-6.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm0 13a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
    },
  ],
]);
export const UnfoldHorizontalRegular = createIcon("UnfoldHorizontalRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M11.034 18.741c.196-.73 1.139-.983 1.673-.448.197.196.275.436.293.707v1c-.018.271-.096.511-.293.707-.25.25-.624.351-.966.259-.453-.122-.711-.515-.741-.966v-1Zm0-5c.196-.73 1.139-.983 1.673-.448.197.196.275.436.293.707v1c-.018.271-.096.511-.293.707-.25.25-.624.351-.966.259-.453-.122-.711-.515-.741-.966v-1Zm7.38-.741H15c-.755-.05-1.269-.802-.866-1.5.088-.152.214-.278.366-.366.175-.101.302-.121.5-.134h3.414l-1.121-1.121c-.131-.149-.207-.254-.259-.449-.226-.842.711-1.561 1.466-1.124l.207.159 2.829 2.828c.179.204.293.429.292.707 0 .278-.113.503-.292.707l-2.829 2.829-.207.159c-.755.436-1.692-.283-1.466-1.125.052-.195.128-.299.259-.449ZM5.586 13l1.121 1.121c.131.15.207.254.259.449.226.842-.711 1.561-1.466 1.125l-.207-.159-2.828-2.829c-.179-.204-.293-.429-.293-.707s.113-.503.293-.707l2.828-2.828.207-.159c.755-.437 1.692.282 1.466 1.124-.052.195-.128.3-.259.449L5.586 11H9c.198.013.326.033.5.134.228.132.398.353.466.607.176.656-.327 1.217-.966 1.259Zm5.448-4.259c.196-.73 1.139-.983 1.673-.448.197.196.275.436.293.707v1c-.018.271-.096.511-.293.707-.25.25-.624.351-.966.259-.453-.122-.711-.515-.741-.966V9Zm0-5c.196-.73 1.139-.983 1.673-.448.197.196.275.436.293.707v1c-.018.271-.096.511-.293.707-.25.25-.624.351-.966.259-.453-.122-.711-.515-.741-.966V4Z",
    },
  ],
]);
export const StrikethroughRegular = createIcon("StrikethroughRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M19 12a1 1 0 1 1 0 2h-2.113c.217.328.395.684.521 1.063.974 2.921-1.2 5.937-4.278 5.937h-1.702a5.74 5.74 0 0 1-5.132-3.17l-.19-.383a1 1 0 0 1 1.789-.894l.19.382A3.74 3.74 0 0 0 11.428 19h1.702a2.51 2.51 0 0 0 1.122-4.756L13.764 14H5a1 1 0 1 1 0-2zm-6.428-9a5.74 5.74 0 0 1 5.132 3.17l.19.383a1 1 0 0 1-1.788.894l-.191-.382A3.74 3.74 0 0 0 12.572 5H10.87a2.51 2.51 0 0 0-1.122 4.756L12.236 11h-4.22a4.5 4.5 0 0 1-1.424-2.063C5.618 6.017 7.792 3 10.87 3z",
    },
  ],
]);
export const SubtitleRegular = createIcon("SubtitleRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M10.437 10.5A2 2 0 0 0 6.5 11v2a2 2 0 0 0 3.937.5m7-3a2 2 0 0 0-3.937.5v2a2 2 0 0 0 3.937.5M4 19h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1",
    },
  ],
]);
export const SunRegular = createIcon("SunRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M12 4V3m5.657 3.343.707-.707M20 12h1m-3.343 5.657.707.707M12 20v1m-5.657-3.343-.707.707M4 12H3m3.343-5.657-.707-.707M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
    },
  ],
]);
export const TableRegular = createIcon("TableRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M4 9h16M4 14h16M12 4v16m-7 0h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z",
    },
  ],
]);
export const Table2Regular = createIcon("Table2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M4 9h16M9 4v16m-4 0h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z",
    },
  ],
]);
export const UnlinkRegular = createIcon("UnlinkRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "m11.646 5.989-1.414-1.414a4 4 0 1 0-5.657 5.656l2.829 2.829a4 4 0 0 0 5.656 0m-.707 4.95 1.415 1.414a4 4 0 0 0 5.656-5.657l-2.828-2.828a4 4 0 0 0-5.657 0M16 4v2M8 18v2M19 8h1M4 16h1",
    },
  ],
]);
export const UpRegular = createIcon("UpRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
      d: "M6.343 14.657 12 9l5.657 5.657",
    },
  ],
]);
export const User3Regular = createIcon("User3Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      d: "M20 18.5c0 1.933-3.582 2.5-8 2.5s-8-.567-8-2.5S7.582 14 12 14s8 2.567 8 4.5ZM16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    },
  ],
]);
export const UserAddRegular = createIcon("UserAddRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M20 9v2m0 0v2m0-2h-2m2 0h2m-6-4a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    },
  ],
]);

// Property types (TYPE_ICONS in @lydie/plugin-api/databases).
export const TextRegular = createIcon("TextRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M11 6H5c-1.322-.087-1.322-1.913 0-2h14c.451.03.844.288.966.741.176.656-.327 1.217-.966 1.259h-6v14c-.036.543-.428 1-1 1s-.964-.457-1-1Z",
    },
  ],
]);
export const AlignLeftRegular = createIcon("AlignLeftRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M3.741 19.966C2.643 19.672 2.796 18.079 4 18h10c.543.036 1 .428 1 1s-.457.964-1 1H4Zm0-5C2.643 14.672 2.796 13.079 4 13h16c.543.036 1 .428 1 1s-.457.964-1 1H4Zm0-5C2.643 9.672 2.796 8.079 4 8h10c.543.036 1 .428 1 1s-.457.964-1 1H4Zm0-5C2.643 4.672 2.796 3.079 4 3h16c.543.036 1 .428 1 1s-.457.964-1 1H4Z",
    },
  ],
]);
export const HashtagRegular = createIcon("HashtagRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "m16.258 10-.5 4H19.5c.543.036 1 .428 1 1s-.457.964-1 1h-3.992l-.516 4.124c-.102.535-.549.939-1.116.868s-.9-.572-.868-1.116L13.492 16H9.508l-.516 4.124c-.102.535-.549.939-1.116.868s-.9-.572-.868-1.116L7.492 16H4.5c-.198-.013-.325-.033-.5-.134a1 1 0 0 1-.466-.607c-.176-.656.327-1.217.966-1.259h3.242l.5-4H5c-.198-.013-.325-.033-.5-.134a1 1 0 0 1-.466-.607C3.858 8.603 4.361 8.042 5 8h3.492l.516-4.124c.102-.535.549-.939 1.116-.868s.9.572.868 1.116L10.508 8h3.984l.516-4.124c.102-.535.549-.939 1.116-.868s.9.572.868 1.116L16.508 8H20c.198.013.325.033.5.134.228.132.398.353.466.607.176.656-.327 1.217-.966 1.259Zm-6 0-.5 4h3.984l.5-4Z",
    },
  ],
]);
export const CircleChevronDownRegular = createIcon("CircleChevronDownRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "m12 12.414 2.121-2.121c.15-.131.254-.207.449-.259.73-.196 1.42.495 1.224 1.225-.052.194-.128.299-.258.448l-2.829 2.828c-.43.378-.983.378-1.414.001l-2.828-2.829c-.298-.34-.394-.8-.159-1.207.339-.588 1.091-.63 1.573-.207Zm-.742 9.558c-1.75-.119-3.446-.731-4.895-1.712C1.054 16.668.538 9.075 5.166 4.701a9.8 9.8 0 0 1 3.148-1.999 10.2 10.2 0 0 1 4.428-.674c1.75.119 3.446.731 4.895 1.712 5.309 3.592 5.825 11.185 1.197 15.559a9.8 9.8 0 0 1-3.148 1.999 10.2 10.2 0 0 1-4.428.674m.116-17.947a8 8 0 0 0-4.377 1.733C2.03 9.744 3.51 17.709 9.585 19.629a8 8 0 0 0 7.418-1.387c4.967-3.985 3.487-11.951-2.588-13.871a8.1 8.1 0 0 0-3.041-.346",
    },
  ],
]);
export const TagRegular = createIcon("TagRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M10.2 6.534c.691.18 1.302.609 1.709 1.196 1.576 2.271-.56 5.315-3.232 4.615a3 3 0 0 1-1.709-1.196c-1.576-2.271.56-5.315 3.232-4.615m-.847 1.913c-1.303.111-1.132 2.096.171 1.985s1.132-2.096-.171-1.985m2.229-6.198c.509.136.932.398 1.317.751l7.886 7.885c1.13 1.236 1.13 2.944 0 4.18l-5.72 5.72c-.517.473-1.128.779-1.834.84-.884.075-1.699-.249-2.346-.84L3 12.899c-.26-.284-.408-.472-.573-.826-.221-.478-.291-.971-.267-1.492l.479-5.268c.19-1.453 1.221-2.484 2.674-2.674l5.268-.479c.384-.018.624-.011 1.001.089m-.908 1.911-5.102.464a1.1 1.1 0 0 0-.341.083c-.364.156-.557.486-.607.865l-.464 5.102a1.14 1.14 0 0 0 .088.554c.062.133.128.209.228.319l7.76 7.76c.233.213.502.345.824.318.26-.023.465-.145.654-.318l5.593-5.593c.426-.466.426-1.012 0-1.478l-7.76-7.76a1.12 1.12 0 0 0-.873-.316",
    },
  ],
]);
export const Progress50Regular = createIcon("Progress50Regular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M13.199 6.121c.535.091 1.072.299 1.551.546 2.161 1.116 3.452 3.489 3.223 5.909a6.05 6.05 0 0 1-3.718 4.987c-.351.143-.892.347-1.277.338-.559-.012-.948-.464-.978-1V7.102c.035-.633.562-1.089 1.199-.981m-.419-4.092c1.747.135 3.445.737 4.888 1.731 5.51 3.795 5.807 11.855.587 16.043a10 10 0 0 1-3.237 1.734 10.02 10.02 0 0 1-8.686-1.296C.822 16.445.525 8.385 5.745 4.197a10 10 0 0 1 3.237-1.734 10.1 10.1 0 0 1 3.798-.434m-1.406 1.996a8 8 0 0 0-4.377 1.733C2.03 9.744 3.51 17.709 9.585 19.629a8 8 0 0 0 7.418-1.387c4.967-3.985 3.487-11.951-2.588-13.871a8.1 8.1 0 0 0-3.041-.346",
    },
  ],
]);
export const CheckboxRegular = createIcon("CheckboxRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "m10.586 13.331 4.95-4.95c.481-.422 1.233-.381 1.573.207.235.407.139.868-.159 1.207l-5.657 5.657-.207.159c-.407.235-.868.139-1.207-.159L7.05 12.624c-.297-.34-.393-.801-.159-1.207.34-.589 1.092-.63 1.574-.207Zm-5.7 7.662C3.798 20.894 3.04 20.092 3 19V5c.018-.494.18-.961.513-1.333C3.897 3.239 4.431 3.021 5 3h14c.494.018.961.18 1.333.513.428.384.646.918.667 1.487v14c-.042 1.135-.865 1.958-2 2H5Zm.12-15.987v13.988h13.988V5.006Z",
    },
  ],
]);
export const MailRegular = createIcon("MailRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M22 17.04c-.067 1.67-1.29 2.893-2.96 2.96H4.96c-1.67-.067-2.893-1.29-2.96-2.96V6.96a3.1 3.1 0 0 1 .332-1.34C2.849 4.623 3.854 4.045 4.96 4h14.08c1.67.067 2.893 1.29 2.96 2.96ZM4 9.456v7.504c.025.622.418 1.015 1.04 1.04h13.92c.336-.014.641-.132.845-.412.138-.188.186-.398.195-.628V9.456l-6.28 4.536c-1.102.721-2.338.721-3.44 0Zm.004-2.464 7.374 5.325c.41.269.834.269 1.244 0l7.374-5.325c-.051-.603-.428-.968-1.036-.992H5.04c-.608.024-.985.389-1.036.992",
    },
  ],
]);
export const PhoneRegular = createIcon("PhoneRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "m13.944 15.005 1.418-1.417.362-.253.503-.133.518.043c.355.093.87.507 1.104.67l1.28.92c.653.498 1.283 1.029 1.842 1.633l.597.698.214.412.061.521c-.021.358-.237.752-.4 1.045a6 6 0 0 1-1.1 1.413c-.905.853-2.142 1.467-3.394 1.567-1.378.11-3.264-.446-4.51-.966-4.088-1.707-7.89-5.509-9.597-9.597-.621-1.488-1.239-3.588-.845-5.21a5.96 5.96 0 0 1 2.867-3.798c.286-.159.678-.374 1.029-.398l.505.05c.382.107.784.48 1.048.711.732.641 1.347 1.402 1.918 2.186l.789 1.135c.165.242.517.685.604 1.021l.041.516-.133.502-.252.361-1.418 1.418c1.032 2.249 2.701 3.918 4.949 4.95M8.645 7.577C7.844 6.398 7.048 5.162 5.926 4.26c-.853.463-1.517 1.195-1.85 2.113a3.4 3.4 0 0 0-.204.837c-.083 1.039.426 2.645.816 3.58 1.56 3.737 5.187 7.298 8.995 8.708.828.306 2.205.701 3.107.629.28-.022.584-.111.846-.205.911-.331 1.628-.986 2.094-1.828-.938-1.098-2.131-1.92-3.31-2.736l-1.362 1.362c-.314.273-.687.427-1.111.392-.446-.035-.915-.315-1.306-.513-1.998-1.013-3.656-2.53-4.807-4.454a13 13 0 0 1-.599-1.126c-.21-.449-.43-.887-.317-1.399.065-.298.17-.457.362-.678Z",
    },
  ],
]);
export const AttachmentRegular = createIcon("AttachmentRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M15.021 20.775c-1.422-.156-2.682-.8-3.715-1.775l-8-8c-.333-.358-.526-.591-.76-1.026-1.047-1.947-.484-4.434 1.288-5.751 1.828-1.358 4.203-1.108 5.838.411l8.014 8.014c.87.962 1.053 2.322.32 3.429a2.78 2.78 0 0 1-3.338 1.035c-.379-.153-.575-.303-.873-.572L6.513 9.257c-.238-.271-.355-.606-.259-.966.209-.778 1.104-.947 1.673-.448l7.211 7.211c.356.322.905.352 1.192-.087.216-.329.12-.7-.129-.975L8.31 6.1c-1.024-.951-2.538-1.048-3.562-.024s-.927 2.538.024 3.562l7.908 7.907c1.588 1.5 3.905 1.739 5.658.351 1.532-1.214 2.047-3.381 1.21-5.151-.217-.458-.512-.844-.858-1.21l-6.52-6.52c-.499-.569-.33-1.465.448-1.673a1 1 0 0 1 .518 0c.194.052.299.128.448.258l6.561 6.561c.491.521.906 1.078 1.214 1.727 2.083 4.406-1.493 9.418-6.338 8.887",
    },
  ],
]);
export const ArrowRightUpRegular = createIcon("ArrowRightUpRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M15.586 7H10c-.639-.042-1.142-.603-.966-1.259.122-.453.515-.711.966-.741h8c.198.013.325.033.5.134.322.186.476.506.5.866v8c-.03.451-.288.844-.741.966-.656.176-1.217-.327-1.259-.966V8.414l-9.95 9.95c-.41.359-1.01.404-1.414 0-.405-.404-.359-1.005 0-1.414Z",
    },
  ],
]);
export const SearchRegular = createIcon("SearchRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "m17.176 15.762 3.652 3.652c.359.41.405 1.01 0 1.414-.404.405-1.004.359-1.414 0l-3.652-3.652c-1.145.85-2.399 1.459-3.814 1.702C5.871 19.921.72 14.327 2.272 8.355a8.5 8.5 0 0 1 1.979-3.618A8.55 8.55 0 0 1 7.68 2.478c6.112-2.146 12.292 3.095 11.198 9.47-.243 1.415-.852 2.669-1.702 3.814M9.938 4.025a6.5 6.5 0 0 0-3.844 1.697 6.5 6.5 0 0 0-1.727 2.622c-1.558 4.436 2.021 9.03 6.695 8.631a6.5 6.5 0 0 0 3.844-1.697 6.5 6.5 0 0 0 1.727-2.622c1.558-4.436-2.021-9.03-6.695-8.631",
    },
  ],
]);
export const TimeRegular = createIcon("TimeRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "m13 11.586 2.707 2.707c.359.409.404 1.01 0 1.414s-1.005.359-1.414 0l-3-3-.159-.207c-.101-.175-.121-.302-.134-.5V7c.03-.451.288-.844.741-.966.656-.176 1.217.327 1.259.966Zm-1.742 10.386c-1.75-.119-3.446-.731-4.895-1.712C1.054 16.668.538 9.075 5.166 4.701a9.8 9.8 0 0 1 3.148-1.999 10.2 10.2 0 0 1 4.428-.674c1.75.119 3.446.731 4.895 1.712 5.309 3.592 5.825 11.185 1.197 15.559a9.8 9.8 0 0 1-3.148 1.999 10.2 10.2 0 0 1-4.428.674m.116-17.947a8 8 0 0 0-4.377 1.733C2.03 9.744 3.51 17.709 9.585 19.629a8 8 0 0 0 7.418-1.387c4.967-3.985 3.487-11.951-2.588-13.871a8.1 8.1 0 0 0-3.041-.346",
    },
  ],
]);
export const CircleUserRegular = createIcon("CircleUserRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M18.809 19.325a10 10 0 0 1-3.791 2.212 10.1 10.1 0 0 1-4.563.345 10 10 0 0 1-3.503-1.247C1.179 17.254.289 9.233 5.192 4.675a10 10 0 0 1 3.79-2.212 10.1 10.1 0 0 1 4.563-.345 10 10 0 0 1 3.503 1.247c5.773 3.381 6.663 11.402 1.761 15.96M8 18.928c2.671 1.434 5.329 1.434 8 0V16.04c-.009-.23-.057-.44-.195-.628-.204-.28-.509-.398-.845-.412H9.04c-.622.025-1.015.418-1.04 1.04ZM9.363 13a4 4 0 0 1-1.222-1.937 4.03 4.03 0 0 1 .172-2.621c1.365-3.233 6.009-3.233 7.374 0 .349.825.409 1.758.172 2.621A4 4 0 0 1 14.637 13c.289 0 .56-.011.848.036a3.03 3.03 0 0 1 2.479 2.479c.071.439.036 1.616.036 1.768.996-1.152 1.67-2.533 1.904-4.044.908-5.854-4.662-10.655-10.319-8.868a8.02 8.02 0 0 0-5.373 5.794 8.1 8.1 0 0 0 0 3.67c.302 1.288.926 2.451 1.788 3.448 0-.152-.035-1.329.036-1.768a3.03 3.03 0 0 1 2.479-2.479c.288-.047.559-.036.848-.036m2.364-4.979c-.43.058-.833.26-1.14.566-1.345 1.345-.195 3.647 1.686 3.392.43-.058.833-.26 1.14-.566 1.345-1.345.195-3.647-1.686-3.392",
    },
  ],
]);
export const FileFilled = createIcon("FileFilled", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M20 10v10c-.046 1.146-.854 1.954-2 2H6c-.43-.017-.83-.129-1.181-.386-.526-.385-.793-.973-.819-1.614V4c.046-1.146.854-1.954 2-2h6v6.5c.039.864.636 1.461 1.5 1.5Zm-.045-2H14V2.044c.39.112.7.263 1 .542L19.414 7c.279.3.429.61.541 1",
    },
  ],
]);
export const Home2Filled = createIcon("Home2Filled", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M20 11v8c-.046 1.147-.853 1.954-2 2H6c-.641-.026-1.229-.292-1.614-.819C4.129 19.83 4.017 19.43 4 19v-8h-.997l-.227-.024c-.62-.136-.961-.867-.669-1.431.077-.15.154-.225.281-.336l8.384-6.521c.422-.296.892-.461 1.414-.412.392.036.723.188 1.042.412l8.384 6.521c.621.538.466 1.58-.388 1.767l-.227.024Z",
    },
  ],
]);
export const StarFilled = createIcon("StarFilled", [
  [
    "path",
    {
      fill: "currentColor",
      d: "m15.875 7.17 5.428 1.175.241.077c.807.351.954 1.326.426 1.977l-3.7 4.142.56 5.525v.253c-.084.876-.965 1.317-1.748 1.016L12 19.096l-5.082 2.239c-.782.301-1.664-.14-1.748-1.016l.001-.253.559-5.525-3.7-4.142c-.527-.651-.381-1.626.426-1.977l.241-.077L8.125 7.17l2.795-4.799c.455-.692 1.405-.866 1.996-.224l.164.224Z",
    },
  ],
]);
export const StarRegular = createIcon("StarRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "m12 19.093-5.18 2.282-.423.087-.509-.117-.411-.299-.269-.448-.048-.429.57-5.632-3.772-4.221-.213-.375-.046-.521.157-.483.344-.394.393-.179 5.532-1.198 2.849-4.891.291-.319.481-.204h.508l.481.204.291.319 2.849 4.891 5.533 1.198.393.179.343.394.157.483-.046.52-.213.376-3.772 4.221.57 5.632-.048.429-.269.448-.411.299-.509.117-.423-.087Zm7.621-9.069-4.594-.995c-.356-.117-.44-.178-.661-.481L12 4.487 9.634 8.549c-.221.302-.305.363-.661.48l-4.594.995 3.132 3.505c.219.303.251.403.252.777l-.473 4.677 4.301-1.896c.357-.114.461-.114.818 0l4.301 1.896-.473-4.677c.001-.374.033-.473.252-.777Z",
    },
  ],
]);
export const ListCollapseRegular = createIcon("ListCollapseRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M18.223 14.976c.247.138.984 1.242 1.16 1.499.231.338 1.572 2.329 1.485 2.687-.107.438-.877.361-1.2.379-.538.029-4.092.13-4.428-.159-.256-.22-.057-.512.065-.742l.189-.346a24 24 0 0 1 1.7-2.617c.14-.188.365-.563.575-.688a.46.46 0 0 1 .454-.013m-5.964 2.058c1.098.294.945 1.887-.259 1.966H4c-.543-.036-1-.428-1-1s.457-.964 1-1h8Zm0-6c1.098.294.945 1.887-.259 1.966H4c-.543-.036-1-.428-1-1s.457-.964 1-1h8Zm5.964-6.058c.247.138.984 1.242 1.16 1.499.231.339 1.572 2.329 1.485 2.687-.107.438-.877.362-1.2.379-.538.03-4.092.13-4.428-.159-.256-.22-.057-.512.065-.742l.189-.346a24 24 0 0 1 1.7-2.616c.14-.188.365-.564.575-.689a.46.46 0 0 1 .454-.013m-5.964.058c1.098.294.945 1.887-.259 1.966H4c-.543-.036-1-.428-1-1s.457-.964 1-1h8Z",
    },
  ],
]);
export const Settings6Regular = createIcon("Settings6Regular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M18.828 19c-.151.358-.166.448-.405.774a3.012 3.012 0 0 1-4.546.349c-.331-.33-.526-.699-.705-1.123H4c-.543-.036-1-.428-1-1s.457-.964 1-1h9.172c.151-.358.166-.448.405-.774a3.012 3.012 0 0 1 4.546-.349c.331.33.526.699.705 1.123H20c.198.013.325.033.5.134.755.436.601 1.606-.241 1.832L20 19Zm-2.992-1.984c-1.286.211-.967 2.18.328 1.968 1.286-.211.967-2.18-.328-1.968M10.828 13c-.151.358-.166.448-.405.774a3.012 3.012 0 0 1-4.546.349c-.331-.33-.526-.699-.705-1.123H4c-.198-.013-.325-.033-.5-.134-.755-.436-.601-1.606.241-1.832L4 11h1.172c.151-.358.166-.448.405-.774a3.012 3.012 0 0 1 4.546-.349c.331.33.526.699.705 1.123H20c.543.036 1 .428 1 1s-.457.964-1 1Zm-2.992-1.984c-1.286.211-.967 2.18.328 1.968 1.286-.211.967-2.18-.328-1.968M18.828 7c-.151.358-.166.448-.405.774a3.012 3.012 0 0 1-4.546.349c-.331-.33-.526-.699-.705-1.123H4c-.543-.036-1-.428-1-1s.457-.964 1-1h9.172c.179-.424.374-.793.705-1.123a3.012 3.012 0 0 1 4.546.349c.239.326.254.416.405.774H20c.198.013.325.033.5.134.755.436.601 1.606-.241 1.832L20 7Zm-2.992-1.984c-1.286.211-.967 2.18.328 1.968 1.286-.211.967-2.18-.328-1.968",
    },
  ],
]);
export const Filter2Regular = createIcon("Filter2Regular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M4 6h16M7 12h10m-7 6h4",
    },
  ],
]);
export const RobotRegular = createIcon("RobotRegular", [
  [
    "path",
    {
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "2",
      d: "M9 12v2m6-2v2m-3-9v2m0-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-7 6h-.5a1.5 1.5 0 0 0 0 3H5zm14 0h.5a1.5 1.5 0 0 1 0 3H19zM8 19h8a3 3 0 0 0 3-3v-6a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3Z",
    },
  ],
]);

export const FolderOpenRegular = createIcon("FolderOpenRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M21 9.031c1.187.249 1.876 1.304 1.587 2.493l-2.431 8.103a2.04 2.04 0 0 1-.703.982c-.341.254-.723.368-1.143.391H3.943c-.445-.026-.846-.153-1.198-.435-.47-.377-.711-.915-.745-1.508V4.943c.063-1.1.843-1.88 1.943-1.943h5.633a2.04 2.04 0 0 1 1.47.707c.51.569.938 1.208 1.438 1.787l.053.006h6.52c.902.052 1.687.642 1.897 1.542l.046.401ZM6.749 11.005l-2.39 7.99h13.893l2.397-7.99Zm12.245-3.499-.051-.006h-6.519a2.04 2.04 0 0 1-1.47-.707c-.51-.569-.938-1.208-1.438-1.787h-5.51L4 13.198l.844-2.823A2.03 2.03 0 0 1 6.691 9H19Z",
    },
  ],
]);

export const CloudRegular = createIcon("CloudRegular", [
  [
    "path",
    {
      fill: "currentColor",
      d: "M5.003 10.422c.019-.413.04-.794.124-1.202a6.6 6.6 0 0 1 1.956-3.488c2.472-2.316 6.444-2.295 8.889.052.723.694 1.23 1.508 1.613 2.429.783.245 1.512.576 2.154 1.096 3.135 2.537 2.962 7.334-.345 9.638-1.001.697-2.183 1.027-3.394 1.053H7a5.7 5.7 0 0 1-1.089-.121 4.9 4.9 0 0 1-2.08-1.013c-2.864-2.388-2.264-6.948 1.172-8.444m11.136-.616c-.351-.319-.39-.857-.588-1.266a4.5 4.5 0 0 0-.979-1.327c-2.18-2.038-5.741-1.403-7.088 1.256a4.5 4.5 0 0 0-.483 2.027c.002.372.101.732-.078 1.079-.21.408-.574.467-.966.613a3 3 0 0 0-.587.295c-1.36.882-1.774 2.753-.902 4.124.567.891 1.522 1.363 2.561 1.393h8.946c.548-.014 1.074-.101 1.581-.315 2.038-.862 2.997-3.251 2.111-5.282a4.03 4.03 0 0 0-2.618-2.263c-.329-.089-.646-.095-.91-.334",
    },
  ],
]);
