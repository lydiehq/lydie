import React from "react";
import {
  ColorPicker as AriaColorPicker,
  ColorPickerProps as AriaColorPickerProps,
  Button,
  DialogTrigger,
} from "react-aria-components";
import { tv } from "tailwind-variants";

import { ColorArea } from "./ColorArea";
import { ColorField } from "./ColorField";
import { ColorSlider } from "./ColorSlider";
import { ColorSwatch } from "./ColorSwatch";
import { Dialog } from "./Dialog";
import { Popover } from "./Popover";
import { focusRing } from "./utils";

const buttonStyles = tv({
  extend: focusRing,
  base: "flex gap-2 items-center cursor-default rounded-xs text-sm text-gray-800 dark:text-gray-200",
});

export interface ColorPickerProps extends AriaColorPickerProps {
  label?: string;
  children?: React.ReactNode;
}

export function ColorPicker({ label, children, ...props }: ColorPickerProps) {
  return (
    <AriaColorPicker {...props}>
      <DialogTrigger>
        <Button className={buttonStyles}>
          <ColorSwatch />
          <span>{label}</span>
        </Button>
        <Popover placement="bottom start">
          <Dialog className="flex flex-col gap-2">
            {children || (
              <>
                <ColorArea colorSpace="hsb" xChannel="saturation" yChannel="brightness" />
                <ColorSlider colorSpace="hsb" channel="hue" />
                <ColorField label="Hex" />
              </>
            )}
          </Dialog>
        </Popover>
      </DialogTrigger>
    </AriaColorPicker>
  );
}
