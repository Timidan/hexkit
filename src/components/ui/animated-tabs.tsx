import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * AnimatedTabContent - Blur transition wrapper for tab content.
 *
 * Replaces the Radix TabsContent pattern with AnimatePresence.
 * On tab switch the old content blurs out then the new content blurs in.
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

const blurVariants = {
  initial: { opacity: 0, filter: "blur(4px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(4px)" },
};

const blurTransition = {
  duration: 0.18,
  ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
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
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeKey}
        variants={blurVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={blurTransition}
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

const layoutExitVariants = {
  initial: { opacity: 0, scale: 0.97, y: 12 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 0.15,
      ease: "easeIn" as const,
    },
  },
};

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
