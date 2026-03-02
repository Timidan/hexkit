import * as React from "react"
import { GripVerticalIcon } from "lucide-react"
import {
  Panel,
  Group,
  Separator,
} from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "bg-transparent hover:bg-primary/10 focus-visible:ring-ring relative flex w-2 items-center justify-center focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden cursor-col-resize transition-colors",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-8 w-1.5 items-center justify-center rounded-full opacity-50 hover:opacity-100 transition-opacity">
          <div className="w-0.5 h-4 bg-muted-foreground/50 rounded-full" />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
