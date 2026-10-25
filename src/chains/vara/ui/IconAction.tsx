import { Button, type ButtonProps } from "../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";

/** An icon-only button whose label is both its accessible name and a hover/focus tooltip. */
export function IconAction({ label, children, variant = "ghost", size = "icon-sm", ...props }: ButtonProps & { label: string }) {
  return (
    <Tooltip>
      {/* The span keeps the tooltip working while the button is disabled (disabled buttons get no pointer events). */}
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button variant={variant} size={size} aria-label={label} {...props}>{children}</Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
