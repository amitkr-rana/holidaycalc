import * as React from "react"

type SpinnerProps = React.HTMLAttributes<HTMLDivElement> & {
  size?: number
  strokeWidth?: number
}

function Spinner({
  size = 32,
  strokeWidth = 2,
  className,
  style,
  ...props
}: SpinnerProps) {
  const spinnerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderWidth: strokeWidth,
    ...style,
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`inline-flex items-center justify-center ${className ?? ""}`}
      {...props}
    >
      <span
        className="inline-block animate-spin rounded-full border-current border-t-transparent text-muted-foreground"
        style={spinnerStyle}
      />
      <span className="sr-only">Loading...</span>
    </div>
  )
}

export { Spinner }
