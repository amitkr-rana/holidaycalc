import * as React from "react"
import { cn } from "@/lib/utils"

const Empty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col items-center justify-center gap-6 rounded-lg border border-dashed border-muted bg-background/80 p-6 text-center shadow-sm backdrop-blur-sm",
      className
    )}
    {...props}
  />
))
Empty.displayName = "Empty"

const EmptyHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-3 text-center",
      className
    )}
    {...props}
  />
)
EmptyHeader.displayName = "EmptyHeader"

const EmptyContent = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-4 text-center",
      className
    )}
    {...props}
  />
)
EmptyContent.displayName = "EmptyContent"

const EmptyMedia = ({
  className,
  variant = "icon",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "icon" | "image"
}) => (
  <div
    className={cn(
      "flex items-center justify-center",
      variant === "icon" && "rounded-full bg-muted p-3 text-muted-foreground",
      className
    )}
    {...props}
  />
)
EmptyMedia.displayName = "EmptyMedia"

const EmptyTitle = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2
    className={cn("text-xl font-semibold tracking-tight", className)}
    {...props}
  />
)
EmptyTitle.displayName = "EmptyTitle"

const EmptyDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={cn("max-w-sm text-sm text-muted-foreground", className)}
    {...props}
  />
)
EmptyDescription.displayName = "EmptyDescription"

export {
  Empty,
  EmptyHeader,
  EmptyContent,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
}
