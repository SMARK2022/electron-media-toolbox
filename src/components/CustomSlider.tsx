// @/components/slider/CustomSlider.tsx
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useEffect, useRef, useState } from "react";

interface CustomSliderProps {
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange?: (value: number) => void;
}

export function CustomSlider({
  label,
  description,
  min,
  max,
  step,
  value,
  onChange,
}: CustomSliderProps) {
  const handleValueChange = (newValue: number[]) => {
    const newValueSingle = newValue[0];
    if (onChange) {
      onChange(newValueSingle);
    }
  };

  // 输入框本地串：编辑期间保留用户未完成的输入（如 "0.99"），失焦时才提交校验
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(value.toString());

  // 滑块拖动 → store 更新 → 新 value 进来 → 同步输入框显示。
  // 焦点门控：用户正在输入时跳过同步，否则会冲掉未完成的输入（如轮询触发的重渲染）
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setInputValue(value.toString());
    }
  }, [value]);

  const commitInput = () => {
    const n = parseFloat(inputValue);
    // 非法/空回退到上一个有效值，不调 onChange；合法则 clamp 到 [min,max] 提交
    if (!Number.isNaN(n) && n >= min && n <= max) {
      if (onChange) onChange(n);
    } else {
      setInputValue(value.toString());
    }
  };

  // 仅 0–1 区间显示百分比换算（相似度阈值场景），保留通用组件语义
  const showPercent = min === 0 && max === 1;

  return (
    <div className="grid gap-2 pt-2">
      <HoverCard openDelay={200}>
        <HoverCardTrigger asChild>
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <Label htmlFor={label}>{label}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  ref={inputRef}
                  type="number"
                  inputMode="decimal"
                  min={min}
                  max={max}
                  step="any"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={commitInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitInput();
                      inputRef.current?.blur();
                    }
                  }}
                  className="text-muted-foreground hover:border-border focus-visible:border-border w-20 rounded-md border border-transparent px-2 py-0.5 text-right text-sm"
                />
                {showPercent && (
                  <span className="text-muted-foreground w-12 text-left text-xs">
                    {(value * 100).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
            <Slider
              id={label}
              min={min}
              max={max}
              value={[value]}
              step={step}
              onValueChange={handleValueChange}
              className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              aria-label={label}
            />
          </div>
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          className="w-[260px] text-sm"
          side="left"
        >
          {description}
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
