"use client";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast"; // Assuming toast is used for displaying alerts
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Validation schema for the form using Zod
const settingsFormSchema = z.object({
  cacheDirectory: z.string().nonempty({ message: "缓存目录不能为空。" }),
  workerThreads: z.number().min(1, { message: "工作线程数必须至少为1。" }),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

// Load saved settings from localStorage (if any)
const loadSettingsFromLocalStorage = (): Partial<SettingsFormValues> => {
  if (typeof window !== "undefined") {
    const savedSettings = localStorage.getItem("settings");
    if (savedSettings) {
      return JSON.parse(savedSettings);
    }
  }
  return {
    cacheDirectory: "",
    workerThreads: 1,
  };
};

// Settings page component
export default function SettingsSubpage() {
  const defaultValues = loadSettingsFromLocalStorage();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues,
    mode: "onChange",
  });

  // Submit handler to save data, show toast, and log to console
  function onSubmit(data: SettingsFormValues) {
    // Save the submitted settings to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("settings", JSON.stringify(data));
    }

    // Show success toast with submitted data
    toast({
      title: "设置已保存",
      description: (
        <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
          <code className="text-white">{JSON.stringify(data, null, 2)}</code>
        </pre>
      ),
    });

    // Log the submitted data to the console
    console.log("Settings saved:", data);
  }

  return (
      <div className="min-h-screen p-16">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="cacheDirectory"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>缓存目录</FormLabel>
                  <FormControl>
                    <Input placeholder="请输入缓存目录" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="workerThreads"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>工作线程数</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="请输入工作线程数"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">更新设置</Button>
          </form>
        </Form>
      </div>
  );
}
