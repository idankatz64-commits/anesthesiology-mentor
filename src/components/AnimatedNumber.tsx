import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useTransform, motion } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  style?: React.CSSProperties;
  suffix?: string;
}

export default function AnimatedNumber({ value, className, style, suffix = '' }: AnimatedNumberProps) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { stiffness: 250, damping: 25, mass: 0.8 });
  const display = useTransform(springValue, (v) => Math.round(v));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = display.on('change', (v) => {
      if (ref.current) {
        ref.current.textContent = `${v}${suffix}`;
      }
    });
    return unsubscribe;
  }, [display, suffix]);

  return <motion.span ref={ref} className={className} style={style}>{0}{suffix}</motion.span>;
}
