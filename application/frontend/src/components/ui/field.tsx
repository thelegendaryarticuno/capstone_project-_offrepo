// Minimal shadcn `field` primitives required by the 21st.dev Login Form Card (not shipped in its registry deps).
import * as React from "react"

import { cn } from "@/lib/utils"

export const FieldGroup = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col gap-5", className)} {...p} />
export const Field = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col gap-2", className)} {...p} />
export const FieldLabel = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label className={cn("text-sm font-medium leading-none", className)} {...p} />
export const FieldDescription = ({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn("text-xs text-muted-foreground", className)} {...p} />
