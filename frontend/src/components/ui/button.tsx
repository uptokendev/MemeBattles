import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.36),0_10px_24px_rgba(0,0,0,0.22)]",
  {
    variants: {
      variant: {
        default: "border-[#6f4a17] bg-[linear-gradient(180deg,rgba(255,199,88,0.95)_0%,rgba(255,145,28,0.88)_42%,rgba(150,76,10,0.95)_100%)] text-primary-foreground hover:brightness-110",
        destructive: "border-red-500/40 bg-[linear-gradient(180deg,rgba(220,38,38,0.95)_0%,rgba(127,29,29,0.98)_100%)] text-destructive-foreground hover:brightness-110",
        outline: "border-white/10 bg-[linear-gradient(180deg,rgba(56,60,68,0.95)_0%,rgba(22,24,28,0.98)_100%)] text-foreground hover:border-amber-400/30 hover:text-foreground",
        secondary: "border-white/10 bg-[linear-gradient(180deg,rgba(60,64,72,0.92)_0%,rgba(20,22,26,0.98)_100%)] text-secondary-foreground hover:border-amber-400/25",
        ghost: "border-transparent bg-transparent text-muted-foreground hover:border-white/10 hover:bg-white/[0.04] hover:text-foreground shadow-none",
        link: "border-none bg-transparent text-amber-300 underline-offset-4 hover:underline shadow-none",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
