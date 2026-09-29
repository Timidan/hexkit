import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/**
 * AnimatedTabContent - Opacity fade-in wrapper for tab content.
 *
 * Replaces the Radix TabsContent pattern with AnimatePresence.
 * On tab switch the old content unmounts immediately and the new content
 * fades in. There is no exit animation: without mode="wait" an exiting panel
 * would stay in the layout next to the entering one.
 *
 * Usage:
 *   <Tabs value={activeTab} onValueChange={setActiveTab}>
 *     <TabsList>...</TabsList>
 *     <AnimatedTabContent activeKey={activeTab} className="...">
 *       {activeTab === "a" && <PanelA />}
 *       {activeTab === "b" && <PanelB />}
 *     </AnimatedTabContent>
 *   </Tabs>
 */

const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

const fadeTransition = {
  duration: 0.12,
  ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
};

interface AnimatedTabContentProps {
  /** Current active tab key - changing this triggers the transition */
  activeKey: string;
  children: React.ReactNode;
  className?: string;
}

export function AnimatedTabContent({
  activeKey,
  children,
  className,
}: AnimatedTabContentProps) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={activeKey}
        variants={fadeVariants}
        initial={shouldReduceMotion ? false : "initial"}
        animate="animate"
        transition={fadeTransition}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * LayoutTransitionWrapper - Scale down + stagger in for layout changes.
 *
 * Used when switching between views with different sizes/structures
 * (e.g. Live ↔ Simulation mode in TransactionBuilderHub).
 */

const makeLayoutVariants = (reduce: boolean) => ({
  initial: reduce
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.97, y: 12 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
    },
  },
  exit: reduce
    ? {
        opacity: 0,
        transition: {
          duration: 0.15,
          ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
        },
      }
    : {
        opacity: 0,
        scale: 0.95,
        transition: {
          duration: 0.15,
          ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
        },
      },
});

interface LayoutTransitionWrapperProps {
  activeKey: string;
  children: React.ReactNode;
  className?: string;
}

export function LayoutTransitionWrapper({
  activeKey,
  children,
  className,
}: LayoutTransitionWrapperProps) {
  const shouldReduceMotion = useReducedMotion();
  const layoutExitVariants = makeLayoutVariants(!!shouldReduceMotion);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeKey}
        variants={layoutExitVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
