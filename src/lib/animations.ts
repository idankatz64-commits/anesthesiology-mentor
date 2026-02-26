import { useEffect, useState } from 'react';

// Spring configs
export const spring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 30,
  mass: 1,
};

export const springGentle = {
  type: "spring" as const,
  stiffness: 250,
  damping: 25,
  mass: 0.8,
};

export const springBouncy = {
  type: "spring" as const,
  stiffness: 500,
  damping: 28,
  mass: 0.6,
};

// Animation variants
export const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: springGentle,
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: spring,
};

export const slideFromRight = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: springGentle,
};

export const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
};

// Reduced motion hook
export function useReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}

// Card interaction props
export const cardHoverTap = {
  whileHover: { scale: 1.02, transition: { duration: 0.15 } },
  whileTap: { scale: 0.97, transition: { duration: 0.1 } },
};
