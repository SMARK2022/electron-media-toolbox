// @/components/slider/CustomSlider.tsx
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import * as React from "react";

interface CustomSliderProps {
    label: string;
    description: string;
    min: number;
    max: number;
    step: number;
    defaultValue: number | number[];
    onChange?: (value: number) => void;
}

export function CustomSlider({
    label,
    description,
    min,
    max,
    step,
    defaultValue,
    onChange,
}: CustomSliderProps) {
    const [value, setValue] = React.useState(defaultValue);

    const handleValueChange = (newValue: number[]) => {
        const newValueSingle = newValue[0];
        setValue(newValueSingle);
        if (onChange) {
            onChange(newValueSingle);
        }
    };

    return (
        <div className="grid gap-2 pt-2">
            <HoverCard openDelay={200}>
                <HoverCardTrigger asChild>
                    <div className="grid gap-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor={label}>{label}</Label>
                            <span className="w-12 rounded-md border border-transparent px-2 py-0.5 text-right text-sm text-muted-foreground hover:border-border">
                                {value}
                            </span>
                        </div>
                        <Slider
                            id={label}
                            min={min}
                            max={max}
                            defaultValue={Array.isArray(value) ? value : [value]}
                            step={step}
                            onValueChange={handleValueChange}
                            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                            aria-label={label}
                        />
                    </div>
                </HoverCardTrigger>
                <HoverCardContent align="start" className="w-[260px] text-sm" side="left">
                    {description}
                </HoverCardContent>
            </HoverCard>
        </div>
    );
}