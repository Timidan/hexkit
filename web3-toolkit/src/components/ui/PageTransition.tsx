import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
  children: React.ReactNode;
}

const PageTransition: React.FC<PageTransitionProps> = ({ children }) => {
  const location = useLocation();

  const pageVariants = {
    initial: {
      opacity: 0,
      x: 100,
      y: 20,
      scale: 0.95,
      filter: 'blur(10px)',
    },
    in: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
    },
    out: {
      opacity: 0,
      x: -100,
      y: -20,
      scale: 1.05,
      filter: 'blur(10px)',
    },
  };

  const pageTransition = {
    type: 'tween' as const,
    ease: [0.25, 0.46, 0.45, 0.94] as const, // Custom cubic-bezier easing
    duration: 0.6,
  };

  const glowVariants = {
    initial: {
      opacity: 0,
      scale: 0.8,
    },
    in: {
      opacity: [0, 0.3, 0.1, 0],
      scale: [0.8, 1.2, 1],
      transition: {
        duration: 1.2,
        ease: 'easeOut' as const,
      },
    },
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="page-transition-wrapper"
        variants={pageVariants}
        initial="initial"
        animate="in"
        exit="out"
        transition={pageTransition}
        style={{
          position: 'relative',
          width: '100%',
        }}
      >
        {/* Background glow effect during transition */}
        <motion.div
          className="page-transition-glow"
          variants={glowVariants}
          initial="initial"
          animate="in"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '120%',
            height: '120%',
            background: `radial-gradient(circle, var(--accent-primary) 0%, transparent 70%)`,
            borderRadius: '50%',
            filter: 'blur(40px)',
            zIndex: -1,
            pointerEvents: 'none',
          }}
        />

        {/* Scan line effect during transition */}
        <motion.div
          className="page-scan-line"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ 
            scaleX: [0, 1, 1, 0], 
            opacity: [0, 1, 1, 0] 
          }}
          transition={{ 
            duration: 0.8, 
            times: [0, 0.3, 0.7, 1],
            ease: 'easeInOut' 
          }}
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: '2px',
            background: `linear-gradient(90deg, 
              transparent 0%, 
              var(--accent-primary) 45%, 
              var(--accent-primary) 55%, 
              transparent 100%)`,
            transformOrigin: 'center',
            zIndex: 10,
            pointerEvents: 'none',
            boxShadow: `0 0 20px var(--accent-primary)`,
          }}
        />

        {/* Grid overlay effect */}
        <motion.div
          className="page-grid-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.1, 0] }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `
              linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px),
              linear-gradient(180deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
            zIndex: -1,
            pointerEvents: 'none',
          }}
        />

        {/* Main content */}
        <motion.div
          className="page-content"
          initial={{ filter: 'brightness(0.8)' }}
          animate={{ filter: 'brightness(1)' }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PageTransition;